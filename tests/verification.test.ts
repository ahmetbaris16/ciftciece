/**
 * Sunucu tarafı ödeme doğrulaması (R-01 parça 1, R-02, R-28): callback/webhook yalnız tetikleyici;
 * sonuç sağlayıcıdan sorgulanır ve beklenen değerlerle karşılaştırılır. Uyuşmazlıkta PAID yok,
 * MISMATCH kaydı + PAYMENT_MISMATCH alarmı.
 */

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { classifyRetrieve } from "@/lib/payment/verify";
import { startCardPayment, handleCardCallback } from "@/lib/payment/card";
import type { RetrievePaymentResult } from "@/lib/payment/types";
import { setupTestDb } from "./helpers/db";
import { FakeIyzico } from "./helpers/fake-iyzico";
import { createTestOrder, orderState } from "./helpers/orders";

setupTestDb();
const fake = new FakeIyzico();
before(() => fake.install());
after(() => fake.uninstall());

type Ok = Extract<RetrievePaymentResult, { ok: true }>;
const ctx = { orderId: "ord_1", amountKurus: 23_900, currency: "TRY", providerToken: "tok_1", conversationId: "att_1" };
const okResponse = (over: Partial<Ok> = {}): Ok => ({
  ok: true,
  apiStatus: "success",
  paymentStatus: "SUCCESS",
  paymentId: "20000001",
  basketId: "ord_1",
  conversationId: "att_1",
  token: "tok_1",
  currency: "TRY",
  price: "239",
  paidPrice: "239.0",
  installment: 1,
  fraudStatus: 1,
  raw: {},
  ...over,
});
const kindOf = (over: Partial<Ok>, expected?: { paymentId?: string; conversationId?: string }) =>
  classifyRetrieve(okResponse(over), { ...ctx, expected });

test("doğrulama: tüm alanlar tutarsa başarılı", () => {
  const r = classifyRetrieve(okResponse(), ctx);
  assert.equal(r.kind, "success");
  assert.equal(r.data.paidAmountKurus, 23_900);
  assert.equal(r.data.chargedAmountKurus, 23_900);
});

test("doğrulama: her uyuşmazlık ayrı ayrı MISMATCH üretir", () => {
  const cases: Array<[string, Partial<Ok>, { paymentId?: string; conversationId?: string }?]> = [
    ["ödeme no yok", { paymentId: undefined }],
    ["bildirimdeki ödeme no farklı", {}, { paymentId: "99999999" }],
    ["sepet no farklı", { basketId: "ord_2" }],
    ["token farklı", { token: "tok_2" }],
    ["conversationId farklı", { conversationId: "att_2" }],
    ["bildirimdeki conversationId farklı", {}, { conversationId: "att_9" }],
    ["para birimi farklı", { currency: "USD" }],
    ["para birimi yok", { currency: undefined }],
    ["tutar farklı", { price: "238.99", paidPrice: "238.99" }],
    ["tutar kuruştan küçük kesirli", { price: "239.001", paidPrice: "239.001" }],
    ["çekilen tutar az", { paidPrice: "200" }],
    ["tek çekimde çekilen tutar fazla", { paidPrice: "250" }],
    ["çekilen tutar okunamadı", { paidPrice: undefined }],
  ];
  for (const [name, over, expected] of cases) {
    const r = kindOf(over, expected);
    assert.equal(r.kind, "mismatch", name);
  }
});

test("doğrulama: taksitte vade farkı (çekilen > sepet) kabul edilir ve kaydedilir", () => {
  const r = kindOf({ paidPrice: "251.95", installment: 3 });
  assert.equal(r.kind, "success");
  assert.equal(r.data.chargedAmountKurus, 25_195);
  assert.equal(r.data.installment, 3);
});

test("doğrulama: fraud reddi başarısız, incelemedeki ödeme başarılı + inceleme işareti, ara durum beklemede", () => {
  assert.equal(kindOf({ fraudStatus: -1 }).kind, "failed");
  const review = kindOf({ fraudStatus: 0 });
  assert.equal(review.kind === "success" && review.fraudReview, true);
  assert.equal(kindOf({ paymentStatus: "FAILURE" }).kind, "failed");
  assert.equal(kindOf({ paymentStatus: "INIT_THREEDS" }).kind, "pending");
  assert.equal(kindOf({ apiStatus: "failure", errorCode: "5129" }).kind, "pending", "sorgu hatası 'ödenmedi' sayılmaz");
});

async function paidCardOrder(payOverrides: Parameters<FakeIyzico["pay"]>[1]) {
  const { order } = await createTestOrder({ priceKurus: 23_900 });
  const r = await startCardPayment(order.id, { appUrl: "http://localhost:3000" });
  assert.equal(r.ok, true);
  const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: order.id } });
  fake.pay(attempt.providerToken!, payOverrides);
  const path = await handleCardCallback({ token: attempt.providerToken!, attemptHint: attempt.id });
  return { order, attempt, path };
}

test("ödenen tutar sipariş tutarıyla uyuşmuyor: PAID yok, PAYMENT_MISMATCH kaydı ve alarmı", async () => {
  const { order, attempt, path } = await paidCardOrder({ overrides: { price: 100, paidPrice: 100 } });
  assert.equal(path, `/siparis/${order.reference}`, "müşteri tekrar ödemeye yönlendirilmez");
  const state = await orderState(order.id);
  assert.equal(state.status, "PENDING");
  assert.equal(state.needsAttention, true);
  const saved = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.equal(saved.status, "MISMATCH");
  assert.equal(saved.paidAmountKurus, 10_000);
  const alert = await prisma.paymentAlert.findFirstOrThrow({ where: { orderId: order.id } });
  assert.equal(alert.kind, "PAYMENT_MISMATCH");
  const ev = await prisma.paymentEvent.findFirstOrThrow({ where: { attemptId: attempt.id, eventType: "verify.mismatch" } });
  assert.equal(ev.source, "CALLBACK");
});

test("para birimi uyuşmuyor: PAID yok, PAYMENT_MISMATCH", async () => {
  const { order } = await paidCardOrder({ overrides: { currency: "USD" } });
  assert.equal((await orderState(order.id)).status, "PENDING");
  assert.equal((await prisma.paymentAlert.findFirstOrThrow({ where: { orderId: order.id } })).kind, "PAYMENT_MISMATCH");
});

test("taksitli ödeme (vade farkı müşteriden): PAID, çekilen tutar ayrıca kaydedilir", async () => {
  const { order, attempt } = await paidCardOrder({ paidPrice: "251.95", installment: 3 });
  assert.equal((await orderState(order.id)).status, "PAID");
  const saved = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.equal(saved.paidAmountKurus, 23_900);
  assert.equal(saved.chargedAmountKurus, 25_195);
  assert.equal(saved.installment, 3);
});

test("fraud incelemesi: sipariş PAID ama NEEDS_ATTENTION + FRAUD_REVIEW alarmı", async () => {
  const { order } = await paidCardOrder({ fraudStatus: 0 });
  const state = await orderState(order.id);
  assert.equal(state.status, "PAID");
  assert.equal(state.needsAttention, true);
  assert.equal((await prisma.paymentAlert.findFirstOrThrow({ where: { orderId: order.id } })).kind, "FRAUD_REVIEW");
});

test("callback'teki deneme kimliği ipucudur: başka denemenin token'ı o denemeyi doğrular", async () => {
  const { order } = await createTestOrder();
  await startCardPayment(order.id, { appUrl: "http://localhost:3000" });
  const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: order.id } });
  fake.pay(attempt.providerToken!);
  const path = await handleCardCallback({ token: attempt.providerToken!, attemptHint: "baska-deneme" });
  assert.equal(path, `/siparis/${order.reference}`);
  assert.equal((await orderState(order.id)).status, "PAID");
});
