import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { NextResponse } from "next/server";

import { ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { SIMULATOR_CANCEL_PREFIX } from "@/lib/payments/simulator";
import { createOrder, createQuoteRequest, orderSchema, orderStatus, quoteRequestSchema, retryOrderPayment } from "@/server/orders";
import { settleIntent } from "@/server/payments";
import { submitOrder, updateOrder } from "@/server/platform-orders";

import { addMember, makeOrg, makeUser, principal, rejection, uid } from "./_helpers";

const req = () => new Request("http://localhost/api/orders", { method: "POST" });

/** A unique, valid Kenyan mobile number per test, so per-phone rate limits never collide across runs. */
function phone(): string {
  const n = Math.floor(Math.random() * 1e8).toString().padStart(8, "0");
  return `07${n}`;
}

describe("public orders: request first, admin prices, customer pays", () => {
  let orgId: string;
  const admin = principal({ role: "SUPER_ADMIN", organizationId: null, userId: "admin-user", mfa: true });

  before(async () => {
    process.env.SIMULATOR_PIN_MS = "0";
    const org = await makeOrg({ plan: "INTERNAL" });
    orgId = org.id;
    const { user } = await makeUser();
    await addMember(user.id, org.id, "OWNER");
    process.env.ORDERS_ORGANIZATION_SLUG = org.slug;
    resetEnvCache();
  });
  after(() => db.$disconnect());

  const base = () => ({ name: "Wanjiku Test", phone: phone(), brief: "A launch poster for a prepaid meter offer." });

  async function request(over: Record<string, unknown> = {}) {
    const result = await createOrder(orderSchema.parse({ kind: "IMAGE", images: 2, ...base(), ...over }), req());
    assert.ok(!(result instanceof NextResponse));
    const order = await db.order.findUniqueOrThrow({ where: { publicToken: result.token } });
    return { result, order };
  }

  it("stores a request with an estimate, charges nothing and starts no payment", async () => {
    const { result, order } = await request({ amountCents: 1 });
    assert.equal(result.status, "REQUESTED");
    assert.equal(order.amountCents, 0, "the browser's amount is ignored and no price is set yet");
    assert.equal(order.suggestedCents, 5_500, "2 images = 4 credits at KES 13.75 = KES 55");
    assert.equal(order.source, "PUBLIC");
    assert.equal(await db.paymentIntent.count({ where: { orderId: order.id } }), 0, "no STK prompt goes to a stranger's phone");
    const status = await orderStatus(order.publicToken);
    assert.equal(status.priced, false);
    assert.equal(status.estimateCents, 5_500);
  });

  it("tells the team a request is waiting", async () => {
    const { order } = await request();
    const notes = await db.notification.count({ where: { organizationId: orgId, href: `/app/orders/${order.id}` } });
    assert.equal(notes, 1);
  });

  it("files a request for extras the same way", async () => {
    const result = await createQuoteRequest(quoteRequestSchema.parse({ extras: ["voiceover"], ...base() }), req());
    assert.ok(!(result instanceof NextResponse));
    assert.equal(result.status, "REQUESTED");
    const order = await db.order.findUniqueOrThrow({ where: { publicToken: result.token } });
    assert.equal(order.kind, "QUOTE");
  });

  it("will not take payment until an admin has priced and submitted the order", async () => {
    const { order } = await request();
    const err = await rejection(() => retryOrderPayment(order.publicToken, undefined, req()));
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 409);
  });

  it("lets only a platform admin price an order", async () => {
    const { order } = await request();
    const owner = principal({ role: "OWNER", organizationId: orgId, userId: "o1", mfa: true });
    const err = await rejection(() => updateOrder(owner, order.id, { amountCents: 150_000, reason: "trying" }));
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 403);
  });

  it("needs a price, and a reason for it, before submitting", async () => {
    const { order } = await request();
    const noPrice = await rejection(() => submitOrder(admin, order.id));
    assert.ok(noPrice instanceof ApiError);
    assert.equal(noPrice.status, 422);
    const noReason = await rejection(() => updateOrder(admin, order.id, { amountCents: 150_000 }));
    assert.ok(noReason instanceof ApiError);
    assert.equal(noReason.status, 422);
  });

  it("runs request -> price -> submit -> pay -> paid, and freezes the price once paid", async () => {
    const { order, result } = await request();

    await updateOrder(admin, order.id, { amountCents: 150_000, reason: "Agreed on WhatsApp, includes captions" });
    const priced = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(priced.amountCents, 150_000);
    assert.equal(priced.status, "REQUESTED", "pricing alone does not release it to the customer");

    const submitted = await submitOrder(admin, order.id);
    assert.equal(submitted.order.status, "PENDING_PAYMENT");
    assert.ok(submitted.order.submittedAt);
    const again = await rejection(() => submitOrder(admin, order.id));
    assert.ok(again instanceof ApiError, "a second submit is refused");

    const view = await orderStatus(result.token);
    assert.equal(view.priced, true);
    assert.equal(view.amountCents, 150_000);

    // The customer asks for the M-Pesa prompt themselves, for the admin's price.
    const paying = await retryOrderPayment(result.token, undefined, req());
    assert.ok(!(paying instanceof NextResponse));
    const intent = await db.paymentIntent.findFirstOrThrow({ where: { orderId: order.id } });
    assert.equal(intent.amountCents, 150_000);
    await settleIntent(intent.id);
    const paid = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(paid.status, "PAID");

    const frozen = await rejection(() => updateOrder(admin, order.id, { amountCents: 100, reason: "too late" }));
    assert.ok(frozen instanceof ApiError);
    assert.equal(frozen.status, 409);
    const edit = await rejection(() => updateOrder(admin, order.id, { details: { brief: "Something else entirely" } }));
    assert.ok(edit instanceof ApiError, "paid details are fixed");
    await updateOrder(admin, order.id, { details: { adminNote: "Customer is a repeat client" } });
  });

  it("refuses a price change while a payment is in flight", async () => {
    process.env.SIMULATOR_PIN_MS = "600000";
    const { order, result } = await request();
    await updateOrder(admin, order.id, { amountCents: 90_000, reason: "first price" });
    await submitOrder(admin, order.id);
    await retryOrderPayment(result.token, undefined, req());
    const err = await rejection(() => updateOrder(admin, order.id, { amountCents: 80_000, reason: "discount" }));
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 409);
    process.env.SIMULATOR_PIN_MS = "0";
  });

  it("lets the admin re-price after a failed payment and the customer pay the new price", async () => {
    const cancelling = `0${SIMULATOR_CANCEL_PREFIX.slice(3)}${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`;
    const { order, result } = await request({ phone: cancelling });
    await updateOrder(admin, order.id, { amountCents: 120_000, reason: "standard" });
    await submitOrder(admin, order.id);
    await retryOrderPayment(result.token, undefined, req());
    const first = await db.paymentIntent.findFirstOrThrow({ where: { orderId: order.id } });
    await settleIntent(first.id);
    assert.equal((await orderStatus(result.token)).status, "PAYMENT_FAILED");

    await updateOrder(admin, order.id, { amountCents: 100_000, reason: "customer asked for a discount" });
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status, "PENDING_PAYMENT");
    const retried = await retryOrderPayment(result.token, phone(), req());
    assert.ok(!(retried instanceof NextResponse));
    const second = await db.paymentIntent.findFirstOrThrow({ where: { orderId: order.id }, orderBy: { createdAt: "desc" } });
    assert.equal(second.amountCents, 100_000);
  });

  it("limits requests from one phone number", async () => {
    const same = phone();
    for (let i = 0; i < 6; i++) {
      const ok = await createOrder(orderSchema.parse({ kind: "IMAGE", images: 1, ...base(), phone: same }), req());
      assert.ok(!(ok instanceof NextResponse), `request ${i + 1} accepted`);
    }
    const blocked = await createOrder(orderSchema.parse({ kind: "IMAGE", images: 1, ...base(), phone: same }), req());
    assert.ok(blocked instanceof NextResponse);
    assert.equal(blocked.status, 429);
  });

  it("rejects numbers we cannot reach and out-of-range lengths", () => {
    assert.throws(() => orderSchema.parse({ kind: "IMAGE", images: 1, ...base(), phone: "+44 7700 900123" }));
    assert.throws(() => orderSchema.parse({ kind: "VIDEO", seconds: 31, ...base() }));
  });

  it("hides an order from anyone without its token", async () => {
    await assert.rejects(() => orderStatus(`missing-${uid()}-token-000000`), /could not find/);
  });
});
