/**
 * Transaction sınırları (kullanıcı maddesi 5):
 *  tx1: sipariş PENDING + stok rezervasyonu (tests/order-transaction.test.ts)
 *  dış çağrı: iyzico — transaction DIŞINDA
 *  tx2: doğrulanmış sonuçla PAID + outbox olayı — birlikte ya da hiçbiri
 */

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { startCardPayment } from "@/lib/payment/card";
import { verifyAttempt } from "@/lib/payment/verify";
import { confirmBankTransferPayment } from "@/lib/payment/offline";
import { updateOrderStatus } from "@/lib/repositories/order.repository";
import { shipOrder } from "@/lib/orders/lifecycle";
import { setupTestDb, withFailingInserts } from "./helpers/db";
import { FakeIyzico } from "./helpers/fake-iyzico";
import { createTestOrder, orderState } from "./helpers/orders";

setupTestDb();
const fake = new FakeIyzico();
before(() => fake.install());
after(() => fake.uninstall());

async function paidAtProvider() {
  const { order } = await createTestOrder();
  assert.equal((await startCardPayment(order.id, { appUrl: "http://localhost:3000" })).ok, true);
  const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: order.id } });
  fake.pay(attempt.providerToken!);
  return { order, attempt };
}

test("tx2: sipariş PAID ve 'order.paid' outbox olayı birlikte yazılır; tekrar doğrulama ikinci olay yazmaz", async () => {
  const { order, attempt } = await paidAtProvider();
  assert.equal((await verifyAttempt(attempt.id, { source: "CALLBACK" })).outcome, "paid");

  const events = await prisma.outboxEvent.findMany({ where: { topic: "order.paid" } });
  assert.equal(events.length, 1);
  assert.equal(events[0].topic, "order.paid");
  assert.equal(events[0].aggregateId, order.id);
  assert.equal(events[0].publishedAt, null, "gönderen işçi yok: yalnız yazılır");
  const payload = events[0].payload as Record<string, unknown>;
  assert.equal(payload.totalKurus, order.totalKurus);
  assert.equal(payload.attemptId, attempt.id);
  assert.ok(!JSON.stringify(payload).includes("@"), "kişisel veri (e-posta) yok");

  await verifyAttempt(attempt.id, { source: "QUERY", force: true });
  assert.equal(await prisma.outboxEvent.count({ where: { topic: "order.paid" } }), 1);
  // Sipariş geçmişine ödeme anı da aynı işlemde yazıldı (müşteri zaman çizelgesi)
  assert.equal(await prisma.orderEvent.count({ where: { orderId: order.id, type: "PAYMENT" } }), 1);
});

test("tx2 ortasında DB hatası: ne PAID ne başarılı deneme ne outbox kalır; sonraki tetikleyici tamamlar", async () => {
  const { order, attempt } = await paidAtProvider();

  await withFailingInserts("outbox_events", () =>
    assert.rejects(verifyAttempt(attempt.id, { source: "CALLBACK" }), /yapay DB hatasi/)
  );
  assert.equal((await orderState(order.id)).status, "PENDING");
  const after1 = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.equal(after1.status, "INITIATED", "deneme yarım SUCCEEDED kalmaz");
  assert.equal(after1.successOrderId, null);
  assert.equal(await prisma.paymentEvent.count({ where: { attemptId: attempt.id, eventType: "verify.success" } }), 0);
  assert.equal(await prisma.outboxEvent.count({ where: { topic: "order.paid" } }), 0);
  assert.equal(await prisma.orderEvent.count({ where: { orderId: order.id, type: "PAYMENT" } }), 0, "geçmiş de geri alınır");

  // Hata geçince (ör. webhook ya da elle sorgu) aynı ödeme tamamlanır
  assert.equal((await verifyAttempt(attempt.id, { source: "QUERY" })).outcome, "paid");
  assert.equal((await orderState(order.id)).status, "PAID");
  assert.equal(await prisma.outboxEvent.count({ where: { topic: "order.paid" } }), 1);
});

test("alarm da aynı transaction'da outbox'a yazılır (alarm kanalı sonraki oturumda)", async () => {
  const { order } = await createTestOrder();
  assert.equal((await startCardPayment(order.id, { appUrl: "http://localhost:3000" })).ok, true);
  const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: order.id } });
  fake.pay(attempt.providerToken!, { overrides: { price: 1, paidPrice: 1 } });
  assert.equal((await verifyAttempt(attempt.id, { source: "CALLBACK" })).outcome, "mismatch");
  const events = await prisma.outboxEvent.findMany({ where: { topic: { not: "order.placed" } } });
  assert.deepEqual(events.map((e) => e.topic), ["payment.alert"]);
  assert.equal((events[0].payload as Record<string, unknown>).kind, "PAYMENT_MISMATCH");
});

test("havale onayı ve kapıda ödeme tahsilatı da 'order.paid' olayını aynı transaction'da yazar", async () => {
  const transfer = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  await confirmBankTransferPayment(transfer.order.id, "admin-1");
  const cod = await createTestOrder({ method: "CASH_ON_DELIVERY", dueInMinutes: null });
  await shipOrder(cod.order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "123456789012" }, "admin-1");
  await updateOrderStatus(cod.order.id, "DELIVERED", "admin-1");

  const events = await prisma.outboxEvent.findMany({ where: { topic: "order.paid" }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(
    events.map((e) => [e.topic, e.aggregateId, (e.payload as Record<string, unknown>).paymentMethod]),
    [
      ["order.paid", transfer.order.id, "BANK_TRANSFER"],
      ["order.paid", cod.order.id, "CASH_ON_DELIVERY"],
    ]
  );
  const codAttempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: cod.order.id } });
  assert.equal(codAttempt.status, "SUCCEEDED");
});
