/** How order statuses read and look in the console. */

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "primary";

export const ORDER_STATUS_TONE: Record<string, Tone> = {
  REQUESTED: "warning",
  PENDING_PAYMENT: "warning",
  PAYMENT_FAILED: "danger",
  PAID: "primary",
  IN_PRODUCTION: "info",
  DELIVERED: "success",
  CANCELLED: "neutral",
  QUOTE_REQUESTED: "warning",
};

export function statusLabel(status: string): string {
  if (status === "REQUESTED") return "needs a price";
  return status.toLowerCase().replace(/_/g, " ");
}
