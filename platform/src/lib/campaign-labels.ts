/** Display labels for campaign fields, shared by the campaign pages. */

export const CAMPAIGN_STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "info"> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  PAUSED: "warning",
  COMPLETED: "info",
  ARCHIVED: "neutral",
};

export const CAMPAIGN_SOURCE_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  GOOGLE: "Google",
  DIRECT: "Direct",
};

export function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
