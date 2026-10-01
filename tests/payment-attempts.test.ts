/**
 * Ödeme denemeleri ve ödeme olayları (R-02, R-03, R-10):
 * bir siparişin birden çok denemesi olabilir, en fazla biri başarılı (DB kısıtı); sipariş notu yazılmaz;
 * geç ödeme ve çift ödeme NEEDS_ATTENTION + alarm üretir, para hareketi otomatik yapılmaz.
 */

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { releaseExpiredOrders } from "@/lib/repositories/order.repository";
import { startCardPayment, handleCardCallback } from "@/lib/payment/card";
import { verifyAttempt } from "@/lib/payment/verify";
import { confirmBankTransferPayment, PaymentConfirmError } from "@/lib/payment/offline";
import { stockOf, setupTestDb } from "./helpers/db";
import { FakeIyzico } from "./helpers/fake-iyzico";
import { createTestOrder, makeOverdue, orderState } from "./helpers/orders";

setupTestDb();
const fake = new FakeIyzico();
before(() => fake.install());
after(() => fake.uninstall());

const ctx = { appUrl: "http://localhost:3000", buyerIp: "203.0.113.5" };

async function openAttempt(orderId: string) {
  const r = await startCardPayment(orderId, ctx);
  assert.equal(r.ok, true, JSON.stringify(r));
  const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId }, orderBy: { createdAt: "desc" } });
  assert.ok(attempt.providerToken);
  return attempt as typeof attempt & { providerToken: string };
}

test("DB kısıtı: bir siparişte ikinci SUCCEEDED deneme yazılamaz", async () => {
  const { order } = await createTestOrder();
  const base = { orderId: order.id, provider: "iyzico", method: "CARD" as const, amountKurus: order.totalKurus };
  await prisma.paymentAttempt.create({ data: { ...base, status: "SUCCEEDED", successOrderId: order.id } });
  await assert.rejects(
    prisma.paymentAttempt.create({ data: { ...base, status: "SUCCEEDED", successOrderId: order.id } }),
    (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
  // CHECK: SUCCEEDED olup successOrderId boş bırakılarak kısıt atlatılamaz
  await assert.rejects(prisma.paymentAttempt.create({ data: { ...base, status: "SUCCEEDED" } }), /payment_attempts_success_order_check/);
  // CHECK: başarısız denemede successOrderId dolu olamaz
  await assert.rejects(
    prisma.paymentAttempt.create({ data: { ...base, status: "FAILED", successOrderId: order.id } }),
    /payment_attempts_success_order_check/
  );
});

test("başarısız denemeden sonra yeni deneme: eski satır ezilmez, sipariş PAID, nota yazılmaz", async () => {
  const { order } = await createTestOrder();
  const first = await openAttempt(order.id);
  fake.fail(first.providerToken);
  assert.equal(await handleCardCallback({ token: first.providerToken, attemptHint: first.id }), "/odeme?error=payment_failed");

  const second = await openAttempt(order.id);
  assert.notEqual(second.id, first.id);
  assert.notEqual(second.providerToken, first.providerToken);
  fake.pay(second.providerToken);
  assert.equal(await handleCardCallback({ token: second.providerToken, attemptHint: second.id }), `/siparis/${order.reference}`);

  const attempts = await prisma.paymentAttempt.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(attempts.map((a) => a.status), ["FAILED", "SUCCEEDED"]);
  assert.equal(attempts[1].providerPaymentId, fake.get(second.providerToken).paymentId);
  assert.equal(attempts[1].paidAmountKurus, order.totalKurus);
  const state = await orderState(order.id);
  assert.equal(state.status, "PAID");
  assert.equal(state.notes, null, "sipariş notuna yazılmamalı");
  assert.equal(await prisma.payment.count(), 0, "eski tek satırlık payments tablosuna yazılmamalı");

  // Kayıtlarda kart verisi yok
  const events = await prisma.paymentEvent.findMany({ where: { orderId: order.id } });
  assert.ok(events.length >= 4);
  const dump = JSON.stringify(events.map((e) => e.payload));
  assert.ok(!dump.includes("55287900") && !dump.includes("lastFourDigits") && !dump.includes("binNumber"));
});

test("açık deneme ödenmişse yeni ödeme formu açılmaz (çift çekim önlemi)", async () => {
  const { order } = await createTestOrder();
  const first = await openAttempt(order.id);
  fake.pay(first.providerToken); // müşteri ödedi ama dönüş (callback) gelmedi
  const again = await startCardPayment(order.id, ctx);
  assert.equal(again.ok, false);
  assert.equal(!again.ok && again.code, "ALREADY_PAID");
  assert.equal((await orderState(order.id)).status, "PAID");
  assert.equal(await prisma.paymentAttempt.count({ where: { orderId: order.id } }), 1, "yeni deneme açılmamalı");
});

test("iki sekmede iki form da ödenirse: ikincisi DUPLICATE + alarm, sipariş tek kez PAID", async () => {
  const { order } = await createTestOrder();
  const a = await openAttempt(order.id);
  const b = await openAttempt(order.id); // a henüz ödenmemişken ikinci sekme
  fake.pay(a.providerToken);
  fake.pay(b.providerToken);

  assert.equal((await verifyAttempt(a.id, { source: "CALLBACK" })).outcome, "paid");
  assert.equal((await verifyAttempt(b.id, { source: "CALLBACK" })).outcome, "duplicate");

  const attempts = await prisma.paymentAttempt.findMany({ where: { orderId: order.id } });
  assert.equal(attempts.filter((x) => x.status === "SUCCEEDED").length, 1);
  assert.equal(attempts.find((x) => x.id === b.id)?.status, "DUPLICATE");
  const state = await orderState(order.id);
  assert.equal(state.status, "PAID");
  assert.equal(state.needsAttention, true);
  const alerts = await prisma.paymentAlert.findMany({ where: { orderId: order.id } });
  assert.deepEqual(alerts.map((x) => x.kind), ["DUPLICATE_PAYMENT"]);

  // Aynı denemeyi tekrar doğrulamak etkisiz: alarm ikilenmez
  assert.equal((await verifyAttempt(b.id, { source: "QUERY", force: true })).outcome, "duplicate");
  assert.equal(await prisma.paymentAlert.count({ where: { orderId: order.id } }), 1);
});

test("geç ödeme, stok var: sipariş yeniden açılır (PAID) ama NEEDS_ATTENTION, stok yeniden ayrılır", async () => {
  const { order, variant } = await createTestOrder({ stock: 5, quantity: 2 });
  const attempt = await openAttempt(order.id);
  await makeOverdue(order.id);
  assert.equal(await releaseExpiredOrders(), 1);
  assert.equal((await orderState(order.id)).status, "CANCELLED");
  assert.equal(await stockOf(variant.id), 5, "iptalde stok iade edildi");
  assert.equal((await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status, "EXPIRED");

  fake.pay(attempt.providerToken); // müşteri süre dolduktan sonra ödedi
  const r = await verifyAttempt(attempt.id, { source: "CALLBACK" });
  assert.equal(r.outcome, "late_reopened");
  const state = await orderState(order.id);
  assert.equal(state.status, "PAID");
  assert.equal(state.needsAttention, true);
  assert.equal(state.notes, null);
  assert.equal(await stockOf(variant.id), 3, "stok yeniden ayrıldı");
  const alerts = await prisma.paymentAlert.findMany({ where: { orderId: order.id } });
  assert.deepEqual(alerts.map((x) => x.kind), ["LATE_PAYMENT"]);
  const expiredEvent = await prisma.paymentEvent.findFirst({ where: { orderId: order.id, eventType: "order.expired" } });
  assert.ok(expiredEvent, "süre dolumu olay olarak kaydedilmeli");
});

test("geç ödeme, stok yok: sipariş CANCELLED kalır, NEEDS_ATTENTION + iade önerisi, otomatik iade yok", async () => {
  const { order, variant } = await createTestOrder({ stock: 1, quantity: 1 });
  const attempt = await openAttempt(order.id);
  await makeOverdue(order.id);
  await releaseExpiredOrders();
  await prisma.inventory.update({ where: { variantId: variant.id }, data: { quantity: 0 } }); // arada satıldı

  fake.pay(attempt.providerToken);
  const r = await verifyAttempt(attempt.id, { source: "CALLBACK" });
  assert.equal(r.outcome, "late_no_stock");
  const state = await orderState(order.id);
  assert.equal(state.status, "CANCELLED");
  assert.equal(state.needsAttention, true);
  assert.equal(await stockOf(variant.id), 0);
  const saved = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.equal(saved.status, "SUCCEEDED", "para alındı: ödeme kaydı kaybolmaz");
  const alert = await prisma.paymentAlert.findFirstOrThrow({ where: { orderId: order.id } });
  assert.equal(alert.kind, "LATE_PAYMENT_NO_STOCK");
  assert.match(alert.message, /İADE ÖNERİLİR/);
});

test("tutar uyuşmazlığı: PAID yapılmaz, MISMATCH + alarm; süresi dolsa da otomatik iptal edilmez", async () => {
  const { order, variant } = await createTestOrder({ stock: 5 });
  const attempt = await openAttempt(order.id);
  fake.pay(attempt.providerToken, { overrides: { price: 1.0 } });

  const r = await verifyAttempt(attempt.id, { source: "CALLBACK" });
  assert.equal(r.outcome, "mismatch");
  const state = await orderState(order.id);
  assert.equal(state.status, "PENDING");
  assert.equal(state.needsAttention, true);
  const saved = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.equal(saved.status, "MISMATCH");
  assert.equal(saved.paidAmountKurus, 100);
  assert.match(saved.failureReason ?? "", /tutar uyuşmuyor/);
  assert.equal((await prisma.paymentAlert.findFirstOrThrow({ where: { orderId: order.id } })).kind, "PAYMENT_MISMATCH");

  await makeOverdue(order.id);
  assert.equal(await releaseExpiredOrders(), 0, "NEEDS_ATTENTION sipariş otomatik iptal edilmez");
  assert.equal((await orderState(order.id)).status, "PENDING");
  assert.equal(await stockOf(variant.id), 4, "stok ayrılı kalır");
});

test("havale onayı: deneme SUCCEEDED, kim onayladı kaydedilir, ikinci onay reddedilir", async () => {
  const { order } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  const pending = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: order.id } });
  assert.equal(pending.provider, "havale");
  assert.equal(pending.status, "INITIATED");

  await confirmBankTransferPayment(order.id, "admin-1");
  assert.equal((await orderState(order.id)).status, "PAID");
  const attempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: pending.id } });
  assert.equal(attempt.status, "SUCCEEDED");
  assert.equal(attempt.successOrderId, order.id);
  const ev = await prisma.paymentEvent.findFirstOrThrow({ where: { orderId: order.id, eventType: "bank_transfer.confirmed" } });
  assert.equal(ev.actorId, "admin-1");
  assert.equal(ev.source, "ADMIN");

  await assert.rejects(confirmBankTransferPayment(order.id, "admin-1"), PaymentConfirmError);
  assert.equal(await prisma.paymentAttempt.count({ where: { orderId: order.id, status: "SUCCEEDED" } }), 1);
});

test("kart siparişi elle 'ödendi' yapılamaz", async () => {
  const { order } = await createTestOrder();
  await assert.rejects(confirmBankTransferPayment(order.id, "admin-1"), /Kart ödemesi elle onaylanamaz/);
  assert.equal((await orderState(order.id)).status, "PENDING");
});

test("süre dolumu: sipariş iptal, stok iade, açık denemeler EXPIRED, olay yazılır, nota yazılmaz", async () => {
  const { order, variant } = await createTestOrder({ method: "BANK_TRANSFER", stock: 3, quantity: 2 });
  assert.equal(await stockOf(variant.id), 1);
  await makeOverdue(order.id);
  assert.equal(await releaseExpiredOrders(), 1);
  assert.equal(await releaseExpiredOrders(), 0, "ikinci çağrı etkisiz");
  const state = await orderState(order.id);
  assert.equal(state.status, "CANCELLED");
  assert.equal(state.notes, null);
  assert.equal(await stockOf(variant.id), 3);
  const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: order.id } });
  assert.equal(attempt.status, "EXPIRED");
  const ev = await prisma.paymentEvent.findFirstOrThrow({ where: { orderId: order.id, eventType: "order.expired" } });
  assert.equal(ev.source, "SYSTEM");
});

test("bilinmeyen token ile gelen dönüş işlenmez ama kaydedilir", async () => {
  const path = await handleCardCallback({ token: "uydurma-token", attemptHint: "uydurma" });
  assert.equal(path, "/odeme?error=payment_not_found");
  const ev = await prisma.paymentEvent.findFirstOrThrow({ where: { source: "CALLBACK" } });
  assert.equal(ev.outcome, "unknown_token");
});

test("sağlayıcıya ulaşılamazsa sonuç 'doğrulanıyor': ödeme başarısız sayılmaz, müşteri tekrar ödemeye yönlendirilmez", async () => {
  const { order } = await createTestOrder();
  const attempt = await openAttempt(order.id);
  fake.pay(attempt.providerToken);
  fake.networkFailures = 1;
  const path = await handleCardCallback({ token: attempt.providerToken, attemptHint: attempt.id });
  assert.equal(path, `/siparis/${order.reference}?odeme=dogrulaniyor`);
  assert.equal((await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status, "INITIATED");
  // Sonraki tetikleyici (ör. yeniden dönüş/elle sorgu) sonucu kaydeder
  assert.equal((await verifyAttempt(attempt.id, { source: "QUERY" })).outcome, "paid");
});
