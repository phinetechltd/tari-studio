import { z } from "zod";

import { ApiError, handler, parseBody } from "@/lib/api";
import { platformSettingsStatus, savePlatformSettings } from "@/server/platform-settings";

/**
 * Deployment-wide provider settings (AI, Meta, M-Pesa, generation), for
 * platform admins only. Keys are write-only: GET returns masked hints.
 */

const Body = z.object({ changes: z.record(z.string(), z.union([z.string().max(2000), z.null()])) });

export const GET = handler({ permission: "platform:manage", allowPlatform: true }, async () => platformSettingsStatus());

export const PUT = handler({ permission: "platform:manage", allowPlatform: true }, async ({ principal, request }) => {
  // These keys can post, message and charge on every tenant's behalf.
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before changing deployment keys.");
  const { changes } = await parseBody(request, Body);
  return savePlatformSettings(principal, changes, request);
});
