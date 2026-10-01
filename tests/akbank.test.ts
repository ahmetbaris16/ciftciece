/**
 * Akbank Sanal POS (ortak ödeme sayfası): form ve imzası, dönüş imzası, sunucudan sorgu ile doğrulama
 * (tarayıcı dönüşü kanıt değil), başarısız ödeme, tutar uyuşmazlığı, sorgu hatası, tarayıcı dönmeyince
 * otomatik sorgu, test ortamı ayrımı ve test modunda kartın müşteriye kapalı olması.
 */

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { startCardPayment } from "@/lib/payment/card";
import { verifyAttempt } from "@/lib/payment/verify";
import { reconcilePendingCardPayments } from "@/lib/payment/auto-reconcile";
import { releaseExpiredOrders } from "@/lib/repositories/order.repository";
import { availablePaymentOptions, DEFAULT_PAYMENT_SETTINGS } from "@/lib/payment/methods";
import { cardAvailabilityForRequest } from "@/lib/payment/availability";
import { cardPaymentMode, paymentProviderStatus } from "@/lib/payment/provider";
import {
  AKBANK_URLS,
  akbank3DFormHash,
  akbankDateTime,
  verifyAkbankReturnHash,
} from "@/lib/payment/providers/akbank";
import { POST as akbankReturn } from "@/app/api/payment/akbank/return/route";
import { setupTestDb, stockOf } from "./helpers/db";
import { createTestOrder, makeOverdue, orderState } from "./helpers/orders";
import { AKBANK_TEST_ENV, FakeAkbank } from "./helpers/fake-akbank";

setupTestDb();
const fake = new FakeAkbank();
const saved: Record<string, string | undefined> = {};

before(() => {
  for (const k of ["PAYMENT_PROVIDER", ...Object.keys(AKBANK_TEST_ENV)]) saved[k] = process.env[k];
  Object.assign(process.env, AKBANK_TEST_ENV);
  fake.install();
});
after(() => {
  fake.uninstall();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
beforeEach(() => {
  fake.payments.clear();
  fake.calls.length = 0;
});

const APP = "http://localhost:3000";

async function startAkbank(opts: { priceKurus?: number; stock?: number } = {}) {
  const { order, variant } = await createTestOrder({ priceKurus: opts.priceKurus ?? 23_900, stock: opts.stock ?? 5 });
  const r = await startCardPayment(order.id, { appUrl: APP });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error("başlatılamadı");
  const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: order.id } });
  return { order, variant, attempt, form: r.form! };
}

function returnRequest(attemptId: string, fields: Record<string, string>) {
  return new NextRequest(`${APP}/api/payment/akbank/return?attempt=${attemptId}`, {
    method: "POST",
    body: new URLSearchParams(fields).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
}

test("ortak ödeme sayfası formu: imzalı alanlar, kart bilgisi yok, deneme test ortamında", async () => {
  const { order, attempt, form } = await startAkbank();
  assert.equal(form.action, AKBANK_URLS.test.gateway);
  const f = form.fields;
  assert.equal(f.paymentModel, "3D_PAY_HOSTING");
  assert.equal(f.txnCode, "3000");
  assert.equal(f.merchantSafeId, AKBANK_TEST_ENV.AKBANK_MERCHANT_SAFE_ID);
  assert.equal(f.terminalSafeId, AKBANK_TEST_ENV.AKBANK_TERMINAL_SAFE_ID);
  assert.equal(f.orderId, attempt.id, "Akbank sipariş no = deneme id");
  assert.equal(f.amount, "239.00");
  assert.equal(f.currencyCode, "949");
  assert.equal(f.installCount, "1");
  assert.equal(f.okUrl, `${APP}/api/payment/akbank/return?attempt=${attempt.id}`);
  assert.equal(f.failUrl, f.okUrl);
  assert.match(f.randomNumber, /^[0-9A-F]{128}$/);
  assert.match(f.requestDateTime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000$/);
  for (const k of ["creditCard", "cvv", "expiredDate"]) assert.equal(f[k], undefined, `${k} formda olmamalı`);
  const { hash, ...rest } = f;
  assert.equal(hash, akbank3DFormHash(rest, AKBANK_TEST_ENV.AKBANK_SECRET_KEY));
  assert.equal(attempt.provider, "akbank-test");
  assert.equal(attempt.providerToken, attempt.id);
  assert.equal(attempt.amountKurus, order.totalKurus);
});

test("Akbank tarih biçimi İstanbul saatiyle", () => {
  assert.equal(akbankDateTime(new Date("2026-01-01T00:00:00Z")), "2026-01-01T03:00:00.000");
  assert.equal(akbankDateTime(new Date("2026-06-30T21:30:05.987Z")), "2026-07-01T00:30:05.000");
});

test("başarılı ödeme: dönüş imzası geçerli, sonuç sunucudan sorgulanır, sipariş PAID, kart verisi kaydedilmez", async () => {
  const { order, attempt } = await startAkbank();
  fake.pay(attempt.id, { amount: "239.00" });
  const fields = fake.returnFields(attempt.id);
  assert.equal(verifyAkbankReturnHash(fields, AKBANK_TEST_ENV.AKBANK_SECRET_KEY), true);

  const res = await akbankReturn(returnRequest(attempt.id, fields));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), `${APP}/siparis/${order.reference}`);
  assert.equal((await orderState(order.id)).status, "PAID");
  const a = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.equal(a.status, "SUCCEEDED");
  assert.equal(a.paidAmountKurus, 23_900);
  assert.match(a.providerPaymentId ?? "", /^6\d+/);
  assert.ok(fake.calls.some((c) => c.body.txnCode === "1010"), "sunucudan sipariş sorgusu yapıldı");
  const cb = await prisma.paymentEvent.findFirstOrThrow({ where: { attemptId: attempt.id, source: "CALLBACK" } });
  assert.equal((cb.payload as Record<string, unknown>).hashValid, true);
  const allEvents = JSON.stringify(await prisma.paymentEvent.findMany({ where: { orderId: order.id } }));
  assert.ok(!allEvents.includes("435509"), "maskelenmiş kart numarası kayda yazılmaz");
});

test("dönüş imzası bozuk olsa da karar sunucu sorgusuyla: imza geçersiz kaydedilir", async () => {
  const { order, attempt } = await startAkbank();
  fake.pay(attempt.id, { amount: "239.00" });
  const res = await akbankReturn(returnRequest(attempt.id, fake.returnFields(attempt.id, { tamper: true })));
  assert.equal(res.status, 303);
  assert.equal((await orderState(order.id)).status, "PAID", "banka sorgusu ödemeyi doğruladı");
  const cb = await prisma.paymentEvent.findFirstOrThrow({ where: { attemptId: attempt.id, source: "CALLBACK" } });
  assert.equal((cb.payload as Record<string, unknown>).hashValid, false);
});

test("ödeme yokken sahte 'başarılı' dönüşü siparişi ödenmiş yapmaz", async () => {
  const { order, attempt } = await startAkbank();
  // Müşteri ödemedi ama biri imzasız "başarılı" form gönderdi
  const res = await akbankReturn(
    returnRequest(attempt.id, { orderId: attempt.id, responseCode: "VPS-0000", amount: "239.00" })
  );
  assert.equal(res.headers.get("location"), `${APP}/siparis/${order.reference}?odeme=dogrulaniyor`);
  assert.equal((await orderState(order.id)).status, "PENDING");
});

test("reddedilen kart: deneme FAILED, sipariş PENDING, müşteri ödeme sayfasına hata ile döner", async () => {
  const { order, attempt } = await startAkbank();
  fake.decline(attempt.id, "239.00");
  const res = await akbankReturn(returnRequest(attempt.id, fake.returnFields(attempt.id)));
  assert.equal(res.headers.get("location"), `${APP}/odeme?error=payment_failed`);
  assert.equal((await orderState(order.id)).status, "PENDING");
  assert.equal((await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status, "FAILED");
});

test("tutar uyuşmazlığı: PAID yok, MISMATCH + alarm + Dikkat", async () => {
  const { order, attempt } = await startAkbank();
  fake.pay(attempt.id, { amount: "1.00" });
  await akbankReturn(returnRequest(attempt.id, fake.returnFields(attempt.id)));
  const s = await orderState(order.id);
  assert.equal(s.status, "PENDING");
  assert.equal(s.needsAttention, true);
  assert.equal((await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status, "MISMATCH");
  assert.equal(await prisma.paymentAlert.count({ where: { orderId: order.id, kind: "PAYMENT_MISMATCH" } }), 1);
});

test("başka siparişe ait Akbank kaydı: sepet no eşleşmez → MISMATCH", async () => {
  const { order, attempt } = await startAkbank();
  fake.pay(attempt.id, { amount: "239.00", orderIdOverride: "baska-siparis" });
  const r = await verifyAttempt(attempt.id, { source: "QUERY" });
  assert.equal(r.outcome, "mismatch");
  assert.equal((await orderState(order.id)).status, "PENDING");
});

test("sorgu hatası ya da ağ hatası: durum değişmez, müşteriye 'doğrulanıyor'", async () => {
  const { order, attempt } = await startAkbank();
  fake.pay(attempt.id, { amount: "239.00" });
  fake.nextResponseCode = "VPS-9999";
  assert.equal((await verifyAttempt(attempt.id, { source: "QUERY" })).outcome, "pending");
  fake.networkFailures = 1;
  const res = await akbankReturn(returnRequest(attempt.id, fake.returnFields(attempt.id)));
  assert.equal(res.headers.get("location"), `${APP}/siparis/${order.reference}?odeme=dogrulaniyor`);
  assert.equal((await orderState(order.id)).status, "PENDING");
  // Sonraki tetikleyici (cron) tamamlar
  const auto = await reconcilePendingCardPayments({ minAgeMs: 0 });
  assert.equal(auto.outcomes.paid, 1);
  assert.equal((await orderState(order.id)).status, "PAID");
});

test("tarayıcı hiç dönmedi: zamanlanmış sorgu ödemeyi bulur; süre dolumu ödenmiş siparişi iptal etmez", async () => {
  const { order, attempt, variant } = await startAkbank({ stock: 3 });
  fake.pay(attempt.id, { amount: "239.00" });
  await makeOverdue(order.id);
  // Sipariş/admin sayfasının tetiklediği temizlik kart siparişini 15 dk boyunca bırakmaz (önce banka sorulur)
  assert.equal(await releaseExpiredOrders(), 0);
  // Zamanlanmış iş: önce sorgu, sonra süre dolumu
  await reconcilePendingCardPayments({ minAgeMs: 0 });
  assert.equal(await releaseExpiredOrders(new Date(), { cardGraceMs: 0 }), 0);
  assert.equal((await orderState(order.id)).status, "PAID");
  assert.equal(await stockOf(variant.id), 2, "stok satılan ürün kadar düşük kalır");
});

test("ödenmemiş kart siparişi: sorguda satış yok → süre dolunca iptal, stok geri", async () => {
  const { order, variant } = await startAkbank({ stock: 3 });
  await makeOverdue(order.id);
  const auto = await reconcilePendingCardPayments({ minAgeMs: 0 });
  assert.equal(auto.outcomes.pending, 1);
  assert.equal(await releaseExpiredOrders(new Date(), { cardGraceMs: 0 }), 1);
  assert.equal((await orderState(order.id)).status, "CANCELLED");
  assert.equal(await stockOf(variant.id), 3);
});

test("test ortamında açılmış deneme canlı anahtarla doğrulanmaz", async () => {
  const { attempt } = await startAkbank();
  fake.pay(attempt.id, { amount: "239.00" });
  process.env.AKBANK_ENV = "prod";
  try {
    const r = await verifyAttempt(attempt.id, { source: "QUERY" });
    assert.equal(r.outcome, "unverified");
    assert.match(r.error ?? "", /akbank-test/);
  } finally {
    process.env.AKBANK_ENV = "test";
  }
});

test("durumlar: demo (anahtar yok) → kart 'yakında'; test → müşteriye kapalı, yalnız yöneticiye; canlı → herkese", async () => {
  assert.equal(cardPaymentMode(), "test");
  const env = { ...process.env };
  try {
    // Canlı sunucu, test ortamı, oturum yok (müşteri)
    Object.assign(process.env, { NODE_ENV: "production" });
    assert.equal(await cardAvailabilityForRequest(), "unavailable");
    const opts = availablePaymentOptions(DEFAULT_PAYMENT_SETTINGS, "unavailable");
    const card = opts.find((o) => o.id === "CARD")!;
    assert.equal(card.available, false);
    assert.match(card.description, /yakında/);
    assert.match(paymentProviderStatus().note, /yalnız siz/);

    process.env.AKBANK_ENV = "prod";
    assert.equal(cardPaymentMode(), "live");
    assert.equal(await cardAvailabilityForRequest(), "ready");

    delete process.env.AKBANK_SECRET_KEY;
    assert.equal(cardPaymentMode(), "demo");
    assert.equal(paymentProviderStatus().mode, "demo");
  } finally {
    Object.assign(process.env, env);
    process.env.AKBANK_ENV = "test";
    process.env.AKBANK_SECRET_KEY = AKBANK_TEST_ENV.AKBANK_SECRET_KEY;
  }
});
