/**
 * Rezervasyon süreleri (kullanıcı kararı): kart 30 dk (iyzico token ömrünü geçmez), havale 48 takvim saati.
 */

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { POST as checkout } from "@/app/api/checkout/route";
import { startCardPayment } from "@/lib/payment/card";
import { CARD_RESERVATION_MINUTES } from "@/lib/payment/reservation";
import { createProduct, enableBankTransfer, setupTestDb } from "./helpers/db";
import { FakeIyzico } from "./helpers/fake-iyzico";
import { checkoutBody, jsonRequest } from "./helpers/http";
import { makeOverdue } from "./helpers/orders";

setupTestDb();
const fake = new FakeIyzico();
before(() => fake.install());
after(() => fake.uninstall());

const URL = "http://localhost:3000/api/checkout";
const ctx = { appUrl: "http://localhost:3000" };

async function placeOrder(paymentMethod: "CARD" | "BANK_TRANSFER") {
  const { variant } = await createProduct({ priceKurus: 10_000, stock: 5 });
  const res = await checkout(jsonRequest(URL, checkoutBody([{ variantId: variant.id, quantity: 1 }], { paymentMethod })));
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  return prisma.order.findUniqueOrThrow({ where: { id: body.orderId } });
}

test("kart siparişi stoğu 30 dk tutar (tek ayar: CARD_RESERVATION_MINUTES)", async () => {
  assert.equal(CARD_RESERVATION_MINUTES, 30);
  const order = await placeOrder("CARD");
  const minutes = (order.paymentDueAt!.getTime() - order.createdAt.getTime()) / 60_000;
  assert.ok(Math.abs(minutes - 30) < 0.1, `kart rezervasyonu ${minutes} dk`);
});

test("havale siparişi stoğu 48 takvim saati tutar", async () => {
  await enableBankTransfer(48);
  const order = await placeOrder("BANK_TRANSFER");
  const hours = (order.paymentDueAt!.getTime() - order.createdAt.getTime()) / 3_600_000;
  assert.ok(Math.abs(hours - 48) < 0.01, `havale süresi ${hours} sa`);
});

test("iyzico token ömrü 30 dk ise rezervasyon değişmez", async () => {
  const order = await placeOrder("CARD");
  assert.equal((await startCardPayment(order.id, ctx)).ok, true);
  const after1 = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(after1.paymentDueAt!.getTime(), order.paymentDueAt!.getTime());
});

test("iyzico daha kısa token ömrü bildirirse rezervasyon token bitişine çekilir", async () => {
  const order = await placeOrder("CARD");
  fake.tokenExpireSeconds = 600;
  try {
    assert.equal((await startCardPayment(order.id, ctx)).ok, true);
  } finally {
    fake.tokenExpireSeconds = 1800;
  }
  const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: order.id } });
  assert.equal(updated.paymentDueAt!.getTime(), attempt.tokenExpiresAt!.getTime());
  assert.ok(updated.paymentDueAt!.getTime() < order.paymentDueAt!.getTime());
  assert.ok(await prisma.paymentEvent.findFirst({ where: { orderId: order.id, eventType: "reservation.shortened_to_token" } }));
});

test("rezervasyon bittiyse yeni ödeme formu açılmaz", async () => {
  const order = await placeOrder("CARD");
  await makeOverdue(order.id);
  const r = await startCardPayment(order.id, ctx);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.code, "EXPIRED");
  assert.equal(await prisma.paymentAttempt.count({ where: { orderId: order.id } }), 0);
});
