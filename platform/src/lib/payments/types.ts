/** The shape every STK-push provider (Daraja, the simulator) implements. */

export type StkProviderName = "MPESA_DARAJA" | "SIMULATOR";

export interface StkInitiateInput {
  amountCents: number;
  /** Canonical payer phone, 2547XXXXXXXX */
  phone: string;
  /** Our reference, shown on the customer's prompt (12 characters at most) */
  reference: string;
  /** Shown on the prompt too (13 characters at most) */
  description: string;
  callbackUrl: string;
}

export interface StkInitiateResult {
  ok: boolean;
  /** Daraja's CheckoutRequestID: the handle for query and callback */
  providerRef?: string;
  merchantRequestId?: string | null;
  /** Something worth showing the payer ("Check your phone…") */
  message?: string;
  error?: string;
}

export interface StkVerifyResult {
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  resultCode?: string;
  failureReason?: string;
  /** Only the simulator knows the receipt at query time; Daraja sends it in the callback */
  receiptRef?: string;
  raw?: unknown;
}

export interface StkVerifyInput {
  providerRef: string;
  phone: string;
  createdAt: Date;
}

export interface StkProvider {
  readonly name: StkProviderName;
  configured(): boolean;
  initiate(input: StkInitiateInput): Promise<StkInitiateResult>;
  /** Asks the provider directly. The only thing allowed to say "paid". */
  verify(input: StkVerifyInput): Promise<StkVerifyResult>;
}
