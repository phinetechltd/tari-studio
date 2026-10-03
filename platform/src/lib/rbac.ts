import { MODULE_CATALOG, type ModuleKey } from "./modules";

/**
 * Role-based access control.
 *
 * A permission resolves to ALLOWED only when both hold:
 *   1. the principal's role (or an explicit grant) carries the permission, and
 *   2. the module that owns the permission is licensed to their organisation.
 *
 * Rule 2 keeps the commercial model honest — an OWNER still cannot open Social
 * Publishing if the agency never bought it. Multi-factor authentication is a
 * third, separate check (`denialReason` reports it) for the few permissions that
 * can hijack a client's public social accounts.
 */

export const ROLES = [
  "SUPER_ADMIN",
  "OWNER",
  "BRAND_MANAGER",
  "APPROVER",
  "DESIGNER",
  "MARKETER",
  "ANALYST",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Platform Admin",
  OWNER: "Owner",
  BRAND_MANAGER: "Brand Manager",
  APPROVER: "Approver",
  DESIGNER: "Designer",
  MARKETER: "Marketer",
  ANALYST: "Analyst",
};

/** Roles an Owner may hand out. SUPER_ADMIN is a platform flag, never granted in an org. */
export const ASSIGNABLE_ROLES: Role[] = ROLES.filter((r) => r !== "SUPER_ADMIN");

export type Permission =
  // platform (never module-gated)
  | "platform:manage"
  | "org:read"
  | "org:write"
  | "member:read"
  | "member:write"
  | "audit:read"
  | "brand:read"
  | "brand:write"
  | "catalogue:read"
  | "catalogue:write"
  // Content Studio
  | "content:read"
  | "content:write"
  | "task:write"
  | "task:work"
  | "content:approve"
  // Social Publishing
  | "channel:read"
  | "channel:connect"
  | "post:read"
  | "post:schedule"
  // Campaigns & Tracking
  | "campaign:read"
  | "campaign:write"
  | "link:write"
  | "report:read"
  // AI
  | "ai:generate"
  | "ai:usage"
  | "asset:read"
  | "asset:write"
  // Orders and tokens (generation is paid for in tokens; see src/lib/pricing.ts)
  | "order:read"
  | "order:write"
  | "token:buy"
  // Templates published by platform admins, and characters each agency keeps
  | "template:read"
  | "character:read"
  | "character:write"
  // WhatsApp inbox and automations
  | "inbox:read"
  | "inbox:reply"
  | "automation:write"
  // Leads
  | "lead:read"
  | "lead:write";

/**
 * Which module owns each permission. Permissions absent from this map belong to
 * the core platform and are always available.
 */
export const PERMISSION_MODULE: Partial<Record<Permission, ModuleKey>> = {
  "content:read": "CONTENT_STUDIO",
  "task:write": "CONTENT_STUDIO",
  "task:work": "CONTENT_STUDIO",
  "content:approve": "CONTENT_STUDIO",

  "channel:read": "SOCIAL_PUBLISHING",
  "channel:connect": "SOCIAL_PUBLISHING",
  "post:read": "SOCIAL_PUBLISHING",
  "post:schedule": "SOCIAL_PUBLISHING",

  "campaign:read": "CAMPAIGN_TRACKING",
  "campaign:write": "CAMPAIGN_TRACKING",
  "link:write": "CAMPAIGN_TRACKING",
  "report:read": "CAMPAIGN_TRACKING",

  "ai:generate": "AI_CONTENT",
  "ai:usage": "AI_CONTENT",
  "order:read": "AI_CONTENT",
  "order:write": "AI_CONTENT",
  "token:buy": "AI_CONTENT",
  "template:read": "AI_CONTENT",
  "character:read": "AI_CONTENT",
  "character:write": "AI_CONTENT",

  "inbox:read": "WHATSAPP_AI",
  "inbox:reply": "WHATSAPP_AI",
  "automation:write": "WHATSAPP_AI",

  "lead:read": "LEADS_CRM",
  "lead:write": "LEADS_CRM",
};

/**
 * Permissions that can publish under, or take over, a client's public accounts.
 * A role that carries one of these must have TOTP enrolled to use it.
 */
export const MFA_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
  "channel:connect",
  "content:approve",
  "member:write",
]);

const READ_BASICS: Permission[] = ["org:read", "brand:read", "catalogue:read"];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: ["platform:manage"], // expanded to everything below

  OWNER: [
    ...READ_BASICS,
    "org:write",
    "member:read",
    "member:write",
    "audit:read",
    "brand:write",
    "catalogue:write",
    "content:read",
    "task:write",
    "content:approve",
    "channel:read",
    "channel:connect",
    "post:read",
    "post:schedule",
    "campaign:read",
    "campaign:write",
    "link:write",
    "report:read",
    "ai:generate",
    "ai:usage",
    "order:read",
    "order:write",
    "template:read",
    "character:read",
    "character:write",
    "token:buy",
    "inbox:read",
    "inbox:reply",
    "automation:write",
    "lead:read",
    "lead:write",
  ],

  BRAND_MANAGER: [
    ...READ_BASICS,
    "member:read",
    "brand:write",
    "catalogue:write",
    "content:read",
    "task:write",
    "channel:read",
    "post:read",
    "post:schedule",
    "campaign:read",
    "campaign:write",
    "link:write",
    "report:read",
    "ai:generate",
    "ai:usage",
    "order:read",
    "order:write",
    "template:read",
    "character:read",
    "character:write",
    "token:buy",
    "inbox:read",
    "inbox:reply",
    "automation:write",
    "lead:read",
    "lead:write",
  ],

  // Reviews and releases work; does not create it. Segregation is enforced in
  // the workflow too: an approver cannot approve a deliverable they submitted.
  APPROVER: [
    ...READ_BASICS,
    "content:read",
    "content:approve",
    "channel:read",
    "post:read",
    "post:schedule",
    "campaign:read",
    "report:read",
    "inbox:read",
    "lead:read",
  ],

  // The narrowest principal, and possibly a freelancer working for several
  // agencies. Sees only tasks assigned to them (`isSelfScoped`).
  DESIGNER: ["brand:read", "catalogue:read", "task:work"],

  MARKETER: [
    ...READ_BASICS,
    "content:read",
    "task:write",
    "post:read",
    "campaign:read",
    "campaign:write",
    "link:write",
    "report:read",
    "ai:generate",
    "order:read",
    "template:read",
    "character:read",
    "character:write",
    "inbox:read",
    "inbox:reply",
    "automation:write",
    "lead:read",
    "lead:write",
  ],

  ANALYST: [
    ...READ_BASICS,
    "content:read",
    "post:read",
    "campaign:read",
    "report:read",
    "ai:usage",
    "order:read",
    "template:read",
    "character:read",
    "inbox:read",
    "lead:read",
  ],
};

export const ALL_PERMISSIONS = Array.from(
  new Set(Object.values(ROLE_PERMISSIONS).flat()),
) as Permission[];

/** The permissions a role carries by default, without any per-member grants. */
export function permissionsOf(role: Role): Permission[] {
  return role === "SUPER_ADMIN" ? ALL_PERMISSIONS : ROLE_PERMISSIONS[role];
}

export interface Principal {
  userId: string;
  /** Null for a platform admin who is not acting inside a tenant. */
  organizationId: string | null;
  role: Role;
  extraPermissions: Permission[];
  enabledModules: ReadonlySet<string>;
  /** Whether this user has completed TOTP enrolment. */
  mfa: boolean;
}

export function can(principal: Principal, permission: Permission): boolean {
  if (principal.role === "SUPER_ADMIN") return true;

  const granted =
    ROLE_PERMISSIONS[principal.role].includes(permission) ||
    principal.extraPermissions.includes(permission);
  if (!granted) return false;

  const owner = PERMISSION_MODULE[permission];
  return owner ? principal.enabledModules.has(owner) : true;
}

export type DenialReason = "role" | "module" | "mfa" | null;

/**
 * Why a permission is denied, so the API can answer 402 (buy the module),
 * 403 (your role) or 403 MFA_REQUIRED (enrol first) rather than one vague 403.
 */
export function denialReason(principal: Principal, permission: Permission): DenialReason {
  if (principal.role === "SUPER_ADMIN") return null;

  const granted =
    ROLE_PERMISSIONS[principal.role].includes(permission) ||
    principal.extraPermissions.includes(permission);
  if (!granted) return "role";

  const owner = PERMISSION_MODULE[permission];
  if (owner && !principal.enabledModules.has(owner)) return "module";

  if (MFA_PERMISSIONS.has(permission) && !principal.mfa) return "mfa";
  return null;
}

/** Human name of the module that owns a permission, for upgrade messages. */
export function moduleNameFor(permission: Permission): string | null {
  const owner = PERMISSION_MODULE[permission];
  return owner ? MODULE_CATALOG[owner].name : null;
}

/** A self-scoped principal sees only records assigned to them. */
export function isSelfScoped(principal: Principal): boolean {
  return principal.role === "DESIGNER";
}
