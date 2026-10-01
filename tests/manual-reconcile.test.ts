/**
 * Elle mutabakat köprüsü (kullanıcı maddesi 6): webhook ve callback kaçsa da admin "iyzico'dan sorgula"
 * ile ödemeyi bulur, doğrular, durumu düzeltir; kim/ne zaman çalıştırdığı kaydedilir.
 */

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { releaseExpiredOrders } from "@/lib/repositories/order.repository";
import { startCardPayment } from "@/lib/payment/card";
import { reconcileOrderWithProvider, ReconcileError } from "@/lib/payment/reconcile";
import { setupTestDb, stockOf } from "./helpers/db";
import { FakeIyzico } from "./helpers/fake-iyzico";
import { createTestOrder, makeOverdue, orderState } from "./helpers/orders";

setupTestDb();
const fake = new FakeIyzico();
before(() => fake.install());
after(() => fake.uninstall());

async function paidWithoutAnyNotification() {
  const { order, variant } = await createTestOrder({ stock: 5 });
  assert.equal((await startCardPayment(order.id, { appUrl: "http://localhost:3000" })).ok, true);
  const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: order.id } });
  fake.pay(attempt.providerToken!); // müşteri ödedi; callback de webhook de gelmedi
  return { order, attempt, variant };
}

test("webhook hiç gelmiyor, elle sorgulama düzeltiyor: sipariş PAID, kim/ne zaman kaydı", async () => {
  const { order, attempt } = await paidWithoutAnyNotification();
  assert.equal((await orderState(order.id)).status, "PENDING");

  const result = await reconcileOrderWithProvider(order.id, "admin-7");
  assert.equal(result.orderStatusBefore, "PENDING");
  assert.equal(result.orderStatusAfter, "PAID");
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].outcome, "paid");
  assert.equal(result.attempts[0].provider?.paymentStatus, "SUCCESS");
  assert.equal(result.attempts[0].provider?.binNumber, undefined, "kart verisi döndürülmez");

  assert.equal((await orderState(order.id)).status, "PAID");
  const saved = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.equal(saved.status, "SUCCEEDED");

  const run = await prisma.paymentEvent.findFirstOrThrow({ where: { orderId: order.id, eventType: "manual_query.run" } });
  assert.equal(run.source, "MANUAL");
  assert.equal(run.actorId, "admin-7");
  const verify = await prisma.paymentEvent.findFirstOrThrow({ where: { attemptId: attempt.id, eventType: "verify.success" } });
  assert.equal(verify.actorId, "admin-7");
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: order.id, action: "order.payment_reconcile" } });
  assert.equal(audit.userId, "admin-7");

  // Tekrar sorgulamak etkisiz
  const again = await reconcileOrderWithProvider(order.id, "admin-7");
  assert.equal(again.attempts[0].outcome, "already_paid");
  assert.equal(again.orderStatusAfter, "PAID");
});

test("elle sorgu iyzico'ya ulaşamazsa durum değişmez ama çalıştırma kaydedilir", async () => {
  const { order } = await paidWithoutAnyNotification();
  fake.networkFailures = 1;
  const result = await reconcileOrderWithProvider(order.id, "admin-7");
  assert.equal(result.attempts[0].outcome, "unverified");
  assert.match(result.attempts[0].error ?? "", /ulaşılamadı|başarısız|fetch failed/);
  assert.equal((await orderState(order.id)).status, "PENDING");
  assert.ok(await prisma.paymentEvent.findFirst({ where: { orderId: order.id, eventType: "manual_query.run" } }));
});

test("süre dolup iptal edilmiş siparişte elle sorgu geç ödemeyi bulur: yeniden açılır + NEEDS_ATTENTION", async () => {
  const { order, variant } = await paidWithoutAnyNotification();
  await makeOverdue(order.id);
  await releaseExpiredOrders();
  assert.equal((await orderState(order.id)).status, "CANCELLED");
  assert.equal(await stockOf(variant.id), 5);

  const result = await reconcileOrderWithProvider(order.id, "admin-7");
  assert.equal(result.attempts[0].outcome, "late_reopened");
  const state = await orderState(order.id);
  assert.equal(state.status, "PAID");
  assert.equal(state.needsAttention, true);
  assert.equal(await stockOf(variant.id), 4);
});

test("bu sürümden önce açılmış ödeme (eski payments satırı) de sorgulanabilir", async () => {
  const { order } = await createTestOrder({ priceKurus: 23_900 });
  const token = "eski-kod-token-1";
  await prisma.payment.create({
    data: { orderId: order.id, provider: "iyzico", providerRef: token, status: "PENDING", amountKurus: order.totalKurus },
  });
  fake.register({ token, conversationId: order.id, basketId: order.id, price: "239.00", paidPrice: "239.00", currency: "TRY" });
  fake.pay(token);

  const result = await reconcileOrderWithProvider(order.id, "admin-7");
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].outcome, "paid");
  assert.equal((await orderState(order.id)).status, "PAID");
  const adopted = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: order.id } });
  assert.equal(adopted.providerToken, token);
  assert.equal(adopted.conversationId, order.id);
});

test("kartla ödenmeyen sipariş sorgulanamaz", async () => {
  const { order } = await createTestOrder({ method: "BANK_TRANSFER" });
  await assert.rejects(reconcileOrderWithProvider(order.id, "admin-7"), ReconcileError);
});

test("ödeme formu hiç açılmamış siparişte sorgulanacak deneme yok", async () => {
  const { order } = await createTestOrder();
  const result = await reconcileOrderWithProvider(order.id, "admin-7");
  assert.equal(result.attempts.length, 0);
  assert.match(result.message, /denemesi yok/);
});
