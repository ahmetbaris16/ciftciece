/**
 * iyzico webhook (kullanıcı maddesi 4, R-01 parça 2, R-25): gelen kutusu + imza + tekrar koruması.
 * Route handler gerçek DB ile çağrılır; iyzico sahte (tests/helpers/fake-iyzico.ts).
 * İstek bağlamı dışında after() çalışmadığı için işleme testte yanıt dönmeden yapılır.
 */

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { POST as webhook } from "@/app/api/payment/webhook/iyzico/route";
import { releaseExpiredOrders } from "@/lib/repositories/order.repository";
import { startCardPayment, handleCardCallback } from "@/lib/payment/card";
import { reconcileOrderWithProvider } from "@/lib/payment/reconcile";
import { ingestIyzicoWebhook, iyzicoWebhookSignature, processWebhookEvent } from "@/lib/payment/webhook/iyzico";
import { setupTestDb } from "./helpers/db";
import { FakeIyzico, TEST_SECRET_KEY } from "./helpers/fake-iyzico";
import { createTestOrder, makeOverdue, orderState } from "./helpers/orders";

setupTestDb();
const fake = new FakeIyzico();
before(() => fake.install());
after(() => fake.uninstall());

const URL = "http://localhost:3000/api/payment/webhook/iyzico";
/** Gelen kutusu satırları (bildirimin kendisi); doğrulama olayları da source WEBHOOK ile yazılır (tetikleyici) */
const INBOX = { source: "WEBHOOK" as const, eventType: { startsWith: "webhook." } };

async function post(body: string, signature?: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["X-IYZ-SIGNATURE-V3"] = signature;
  const res = await webhook(new NextRequest(URL, { method: "POST", body, headers }));
  return { status: res.status, body: await res.json() };
}

async function cardOrderWithForm(stock = 5) {
  const { order, variant } = await createTestOrder({ stock });
  assert.equal((await startCardPayment(order.id, { appUrl: "http://localhost:3000" })).ok, true);
  const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: order.id }, orderBy: { createdAt: "desc" } });
  return { order, variant, attempt, token: attempt.providerToken! };
}

test("imza: üretim kodu dokümandaki HPP formülüyle aynı imzayı üretir", () => {
  const p = { iyziEventType: "CHECKOUT_FORM_AUTH", iyziPaymentId: "22416035", token: "tok-x", paymentConversationId: "conv-1", status: "SUCCESS" };
  const expected = createHmac("sha256", TEST_SECRET_KEY)
    .update(TEST_SECRET_KEY + p.iyziEventType + p.iyziPaymentId + p.token + p.paymentConversationId + p.status)
    .digest("hex");
  assert.equal(iyzicoWebhookSignature(TEST_SECRET_KEY, p), expected);
});

test("callback hiç gelmiyor, sadece webhook geliyor: sipariş PAID", async () => {
  const { order, attempt, token } = await cardOrderWithForm();
  fake.pay(token);
  const { body, signature } = fake.webhook(token);

  const res = await post(body, signature);
  assert.equal(res.status, 200);
  assert.equal(res.body.received, true);
  assert.equal((await orderState(order.id)).status, "PAID");

  const inbox = await prisma.paymentEvent.findFirstOrThrow({ where: INBOX });
  assert.equal(inbox.status, "PROCESSED");
  assert.equal(inbox.outcome, "paid");
  assert.equal(inbox.signatureValid, true);
  assert.equal(inbox.attemptId, attempt.id);
  const verify = await prisma.paymentEvent.findFirstOrThrow({ where: { attemptId: attempt.id, eventType: "verify.success" } });
  assert.equal(verify.source, "WEBHOOK");
  // Bildirimdeki ödeme no sorgu sonucuyla eşleşti
  assert.equal((await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).providerPaymentId, fake.get(token).paymentId);
});

test("webhook iki kez geliyor (sırayla ve eşzamanlı): tek kayıt, etki bir kez", async () => {
  const { order, token, variant } = await cardOrderWithForm();
  fake.pay(token);
  const first = fake.webhook(token);

  const [a, b] = await Promise.all([post(first.body, first.signature), post(first.body, first.signature)]);
  assert.deepEqual([a.status, b.status], [200, 200]);
  const retry = await post(first.body, first.signature); // iyzico'nun 15 dk sonraki tekrarı
  assert.equal(retry.status, 200);
  assert.equal(retry.body.duplicate, true);
  // iyziEventTime farklı ama aynı olay (yeniden gönderim) → yine tek satır
  const resent = fake.webhook(token);
  assert.equal((await post(resent.body, resent.signature)).body.duplicate, true);

  assert.equal(await prisma.paymentEvent.count({ where: INBOX }), 1);
  assert.equal((await orderState(order.id)).status, "PAID");
  assert.equal(await prisma.paymentAttempt.count({ where: { orderId: order.id, status: "SUCCEEDED" } }), 1);
  assert.equal(await prisma.paymentAlert.count(), 0);
  const inv = await prisma.inventory.findUniqueOrThrow({ where: { variantId: variant.id } });
  assert.equal(inv.quantity, 4, "stok bir kez düştü");
});

test("webhook sıra dışı geliyor: başarıdan sonra gelen 'başarısız' ve ara durum bildirimleri durumu geri almaz", async () => {
  const { order, attempt, token } = await cardOrderWithForm();
  fake.pay(token);
  const success = fake.webhook(token);
  const lateFailure = fake.webhook(token, { status: "FAILURE" });
  const lateInit = fake.webhook(token, { status: "INIT_THREEDS" });

  assert.equal((await post(success.body, success.signature)).status, 200);
  assert.equal((await orderState(order.id)).status, "PAID");

  // En kötü durum: sorgu da artık "başarısız" dese bile sonuçlanmış deneme değişmez
  fake.get(token).state = "FAILURE";
  assert.equal((await post(lateFailure.body, lateFailure.signature)).status, 200);
  assert.equal((await post(lateInit.body, lateInit.signature)).status, 200);

  assert.equal((await orderState(order.id)).status, "PAID");
  assert.equal((await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status, "SUCCEEDED");
  const events = await prisma.paymentEvent.findMany({ where: INBOX, orderBy: { processedAt: "asc" } });
  assert.deepEqual(
    events.map((e) => [e.status, e.outcome]),
    [
      ["PROCESSED", "paid"],
      ["PROCESSED", "already_paid"],
      ["IGNORED", "ara durum: INIT_THREEDS"],
    ]
  );
});

test("webhook sıra dışı: eski (başarısız) denemenin bildirimi yeni denemeyle ödenmiş siparişi etkilemez", async () => {
  const { order, token: oldToken } = await cardOrderWithForm();
  fake.fail(oldToken);
  assert.equal(await handleCardCallback({ token: oldToken }), "/odeme?error=payment_failed");
  const second = await startCardPayment(order.id, { appUrl: "http://localhost:3000" });
  assert.equal(second.ok, true);
  const newAttempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: order.id, status: "INITIATED" } });
  fake.pay(newAttempt.providerToken!);
  const ok = fake.webhook(newAttempt.providerToken!);
  assert.equal((await post(ok.body, ok.signature)).status, 200);
  assert.equal((await orderState(order.id)).status, "PAID");

  const old = fake.webhook(oldToken, { status: "FAILURE" });
  assert.equal((await post(old.body, old.signature)).status, 200);
  assert.equal((await orderState(order.id)).status, "PAID");
});

test("imza doğrulanamazsa: işlenmez, REJECTED kaydedilir, alarm üretilir; sahte olay siparişi etkilemez", async () => {
  const { order, token } = await cardOrderWithForm();
  fake.pay(token);
  const real = fake.webhook(token);

  const wrong = await post(real.body, "0".repeat(64));
  assert.equal(wrong.status, 401);
  const missing = await post(real.body, null);
  assert.equal(missing.status, 401);
  const forgedKey = fake.webhook(token, { secretKey: "baska-anahtar" });
  assert.equal((await post(forgedKey.body, forgedKey.signature)).status, 401);
  assert.equal((await post(forgedKey.body, forgedKey.signature)).status, 401, "aynı sahte gövdenin tekrarı");

  assert.equal((await orderState(order.id)).status, "PENDING", "imzasız bildirimle PAID yapılmaz");
  const rejected = await prisma.paymentEvent.findMany({ where: INBOX });
  assert.equal(rejected.length, 3, "üç farklı istek, tekrar eden tek satır");
  assert.ok(rejected.every((e) => e.status === "REJECTED" && e.signatureValid === false && e.orderId === null));
  const alerts = await prisma.paymentAlert.findMany({ where: { kind: "WEBHOOK_SIGNATURE_INVALID" } });
  assert.equal(alerts.length, 3);
  assert.equal(alerts.every((a) => a.orderId === null), true, "sahte bildirim siparişi NEEDS_ATTENTION yapmaz");

  // Sahte olay sipariş süre dolumunu engellemez
  await makeOverdue(order.id);
  assert.equal(await releaseExpiredOrders(), 1);

  // Gerçek imzalı bildirim yine işlenir (doğrulanamayan olay geçerli olayın anahtarını işgal etmez)
  assert.equal((await post(real.body, real.signature)).status, 200);
  const state = await orderState(order.id);
  assert.equal(state.status, "PAID", "geç ödeme: stok vardı, yeniden açıldı");
  assert.equal(state.needsAttention, true);
});

test("bildirim 'başarılı' ama iyzico'ya sorulamadı: satır açık kalır, sipariş iptal edilmez, elle sorgu kapatır", async () => {
  const { order, token } = await cardOrderWithForm();
  fake.pay(token);
  const ev = fake.webhook(token);
  fake.networkFailures = 1;
  assert.equal((await post(ev.body, ev.signature)).status, 200, "kayıt yazıldı → 200 (iyzico tekrar göndermez)");

  const inbox = await prisma.paymentEvent.findFirstOrThrow({ where: INBOX });
  assert.equal(inbox.status, "FAILED");
  assert.equal((await orderState(order.id)).status, "PENDING");

  await makeOverdue(order.id);
  assert.equal(await releaseExpiredOrders(), 0, "işlenmemiş ödeme bildirimi olan sipariş iptal edilmez");

  const r = await reconcileOrderWithProvider(order.id, "admin-1");
  assert.equal(r.orderStatusAfter, "PAID");
  const closed = await prisma.paymentEvent.findUniqueOrThrow({ where: { id: inbox.id } });
  assert.equal(closed.status, "PROCESSED");
  assert.equal(closed.outcome, "settled:paid");
});

test("bu siteye ait olmayan token: kaydedilir, yok sayılır", async () => {
  fake.register({ token: "baska-site-token", conversationId: "x", basketId: "y", price: "10.00", paidPrice: "10.00", currency: "TRY" });
  fake.pay("baska-site-token");
  const ev = fake.webhook("baska-site-token");
  assert.equal((await post(ev.body, ev.signature)).status, 200);
  const inbox = await prisma.paymentEvent.findFirstOrThrow({ where: INBOX });
  assert.equal(inbox.status, "IGNORED");
  assert.match(inbox.outcome ?? "", /bilinmeyen ödeme/);
});

test("JSON olmayan ya da çok büyük gövde işlenmez", async () => {
  assert.equal((await post("bu json değil", "abc")).status, 401);
  const big = JSON.stringify({ token: "x", pad: "a".repeat(20_000) });
  assert.equal((await post(big, "abc")).status, 413);
  assert.equal(await prisma.paymentEvent.count({ where: { ...INBOX, status: "REJECTED" } }), 1);
});

test("ilk teslim işlenirken gelen ikinci teslim olayı yeniden işlemez (gerçek HTTP denemesinde görülen yarış)", async () => {
  const { order, attempt, token } = await cardOrderWithForm();
  fake.pay(token);
  const ev = fake.webhook(token);

  // 1. teslim: kaydedildi, işleme henüz başlamadı/sürüyor (route'ta after() ile yanıttan sonra)
  const first = await ingestIyzicoWebhook(ev.body, ev.signature, TEST_SECRET_KEY);
  assert.equal(first.kind === "accepted" && first.needsProcessing, true);
  // 2. teslim aynı anda: yeni satır yok ve yeniden işleme istenmez
  const second = await ingestIyzicoWebhook(ev.body, ev.signature, TEST_SECRET_KEY);
  assert.equal(second.kind === "accepted" && second.duplicate, true);
  assert.equal(second.kind === "accepted" && second.needsProcessing, false);

  assert.equal(first.kind === "accepted" && (await processWebhookEvent(first.eventId)).outcome, "paid");
  assert.equal((await orderState(order.id)).status, "PAID");
  assert.equal(await prisma.paymentEvent.count({ where: { attemptId: attempt.id, eventType: { startsWith: "verify." } } }), 1);
  const inbox = await prisma.paymentEvent.findFirstOrThrow({ where: INBOX });
  assert.equal(inbox.outcome, "paid");
  // İşlenmiş olayı tekrar işlemek etkisiz
  assert.equal(first.kind === "accepted" && (await processWebhookEvent(first.eventId)).outcome, "skipped");
});
