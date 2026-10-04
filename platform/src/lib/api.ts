import "server-only";

import { NextResponse } from "next/server";
import { ZodError, type z, type ZodTypeAny } from "zod";

import { accountFromClaims, getPrincipal, readSessionClaims, type AccountSession } from "./auth";
import { LimitReachedError } from "./limits";
import { MODULE_CATALOG, type ModuleKey } from "./modules";
import { refreshPlatformConfig } from "./platform-config";
import {
  can,
  denialReason,
  moduleNameFor,
  type Permission,
  type Principal,
} from "./rbac";

/**
 * Shared plumbing for API route handlers.
 *
 * Every endpoint funnels through `handler()`, which resolves the principal,
 * checks the permission (role AND module licence AND multi-factor where the
 * permission demands it), and turns thrown errors into one response envelope.
 */

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiFailure {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}

export function ok<T>(data: T, meta?: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data, ...(meta ? { meta } : {}) } satisfies ApiSuccess<T>, init);
}

export function fail(status: number, code: string, message: string, details?: unknown, init?: ResponseInit) {
  return NextResponse.json(
    { ok: false, error: { code, message, ...(details ? { details } : {}) } } satisfies ApiFailure,
    { status, ...init },
  );
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (m: string, d?: unknown) => new ApiError(400, "BAD_REQUEST", m, d);
export const notFound = (m = "Not found") => new ApiError(404, "NOT_FOUND", m);
export const conflict = (m: string) => new ApiError(409, "CONFLICT", m);
export const forbidden = (m = "Forbidden") => new ApiError(403, "FORBIDDEN", m);

export interface HandlerContext<P = Record<string, string>> {
  principal: Principal;
  request: Request;
  params: P;
  searchParams: URLSearchParams;
  /** Set only on `account: true` routes */
  account?: AccountSession;
}

export interface HandlerOptions {
  /** Permission required to reach the handler (role AND licence AND MFA). */
  permission?: Permission;
  /**
   * Any signed-in principal may call this (sign-out, switch organisation, the
   * caller's own security settings). Stated explicitly rather than implied by
   * omission, so `scripts/check-permissions.mjs` can insist every route says
   * *something* about who may reach it.
   */
  authOnly?: boolean;
  /** Extra module requirement beyond the permission's own module. */
  module?: ModuleKey;
  /** Allow a principal with no organisation (platform mode). Default false. */
  allowPlatform?: boolean;
  /**
   * Any signed-in, verified person, even one who is not in a team yet (create a
   * team, list teams, switch teams, their own password and phone). The handler
   * gets `account`, not a principal, so it cannot act inside a team by accident.
   */
  account?: boolean;
  /** Skip auth entirely — only for sign-in, health and public redirects. */
  public?: boolean;
}

type RouteArgs<P> = { params: Promise<P> };

/**
 * State-changing requests must come from this site. SameSite=Lax already stops
 * the browser sending the cookie on a cross-site POST; this rejects an explicit
 * foreign Origin as well, so the defence does not rest on one mechanism.
 */
export function isSameOrigin(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser client or same-origin navigation without the header
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function handler<P extends Record<string, string> = Record<string, string>, R = unknown>(
  options: HandlerOptions,
  fn: (ctx: HandlerContext<P>) => Promise<R | NextResponse>,
) {
  return async (request: Request, args: RouteArgs<P>): Promise<NextResponse> => {
    try {
      // Provider settings saved in the console (throttled; see platform-config.ts).
      await refreshPlatformConfig();
      const params = ((await args?.params) ?? {}) as P;
      const searchParams = new URL(request.url).searchParams;

      if (!isSameOrigin(request)) {
        return fail(403, "CROSS_ORIGIN", "Cross-origin requests are not accepted.");
      }

      if (options.public) {
        const result = await fn({
          principal: undefined as unknown as Principal,
          request,
          params,
          searchParams,
        });
        return result instanceof NextResponse ? result : ok(result);
      }

      if (options.account) {
        const claims = await readSessionClaims();
        const account = claims ? await accountFromClaims(claims) : null;
        if (!account) return fail(401, "UNAUTHENTICATED", "Sign in to continue.");
        const result = await fn({ principal: undefined as unknown as Principal, request, params, searchParams, account });
        return result instanceof NextResponse ? result : ok(result);
      }

      const principal = await getPrincipal();
      if (!principal) return fail(401, "UNAUTHENTICATED", "Sign in to continue.");

      if (!principal.organizationId && !options.allowPlatform) {
        return fail(403, "TENANT_REQUIRED", "This endpoint works inside an organisation. Choose one first.");
      }

      if (options.permission) {
        const reason = denialReason(principal, options.permission);
        if (reason === "module") {
          const name = moduleNameFor(options.permission);
          return fail(402, "MODULE_NOT_LICENSED", `${name ?? "This module"} is not part of your subscription.`, {
            module: name,
          });
        }
        if (reason === "mfa") {
          return fail(403, "MFA_REQUIRED", "Turn on two-factor authentication to do this.", {
            permission: options.permission,
          });
        }
        if (reason === "role" || !can(principal, options.permission)) {
          return fail(403, "FORBIDDEN", "Your role does not permit this action.", {
            permission: options.permission,
          });
        }
      }

      if (options.module && principal.role !== "SUPER_ADMIN" && !principal.enabledModules.has(options.module)) {
        return fail(402, "MODULE_NOT_LICENSED", `${MODULE_CATALOG[options.module].name} is not part of your subscription.`, {
          module: MODULE_CATALOG[options.module].name,
        });
      }

      const result = await fn({ principal, request, params, searchParams });
      return result instanceof NextResponse ? result : ok(result);
    } catch (error) {
      return normaliseError(error);
    }
  };
}

function normaliseError(error: unknown): NextResponse {
  if (error instanceof ApiError) return fail(error.status, error.code, error.message, error.details);

  if (error instanceof LimitReachedError) {
    return fail(402, "LIMIT_REACHED", error.message, { limit: error.limit, max: error.max, used: error.used });
  }

  if (error instanceof ZodError) {
    return fail(422, "VALIDATION_FAILED", "Request payload is invalid.", {
      issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  // Provider errors are matched by name so this file does not import server modules.
  const name = error instanceof Error ? error.name : "";
  if (name === "AiNotConfiguredError" || name === "StandInProviderError") {
    return fail(503, "PROVIDER_NOT_CONFIGURED", (error as Error).message);
  }
  if (name === "AiRefusedError") return fail(422, "AI_REFUSED", (error as Error).message);

  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("module is not licensed")) {
    return fail(402, "MODULE_NOT_LICENSED", "AI generation is not part of your subscription.");
  }
  if (message.includes("Unique constraint failed")) {
    return fail(409, "CONFLICT", "A record with these details already exists.");
  }
  if (message.includes("Foreign key constraint")) {
    return fail(400, "BAD_REFERENCE", "A referenced record does not exist.");
  }

  console.error("[api] unhandled", error);
  return fail(500, "INTERNAL_ERROR", "Something went wrong on our side.");
}

// ── request parsing ────────────────────────────────────────────────────

/** Parses and validates a JSON body. Typed by the schema's *output*, so transforms and defaults are honoured. */
export async function parseBody<S extends ZodTypeAny>(request: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
  return schema.parse(raw);
}

export function parseQuery<S extends ZodTypeAny>(searchParams: URLSearchParams, schema: S): z.output<S> {
  return schema.parse(Object.fromEntries(searchParams.entries()));
}

export interface Page {
  take: number;
  skip: number;
  page: number;
}

export function pagination(searchParams: URLSearchParams, defaultTake = 50): Page {
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const take = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? defaultTake) || defaultTake));
  return { take, skip: (page - 1) * take, page };
}

export function paginationMeta(page: Page, total: number) {
  return { page: page.page, limit: page.take, total, pages: Math.max(1, Math.ceil(total / page.take)) };
}
