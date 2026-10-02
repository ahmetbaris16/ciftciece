/**
 * Demo banka (sanal POS bağlanana kadar): kartla ödeme banka sayfasının demo kopyasıyla baştan sona.
 * Deneme demo sağlayıcısıyla açılır → 6 haneli kod → doğru kodda onay → dönüş adresinde sunucu sorgusu → sipariş PAID.
 * Yanlış kod 3 kez / vazgeç → ret; onaysız dönüş siparişi ödenmiş yapmaz; tarayıcı dönmese de zamanlanmış sorgu bulur;
 * kip ve erişim (canlı sunucuda yalnız yönetici); kart verisi kayda girmez.
 */

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { startCardPayment } from "@/lib/payment/card";
import { cardPaymentMode, getPaymentProvider, isTestProvider, paymentProviderStatus } from "@/lib/payment/provider";
import { cardAvailabilityForRequest } from "@/lib/payment/availability";
import { availablePaymentOptions, DEFAULT_PAYMENT_SETTINGS } from "@/lib/payment/methods";
import { cancelDemoPayment, loadDemoSession, maskPhone, sendDemoCode, verifyDemoCode } from "@/lib/payment/demo";
import { reconcilePendingCardPayments } from "@/lib/payment/auto-reconcile";
import { GET as verifyReturn } from "@/app/api/payment/verify/route";
import { POST as demoApi } from "@/app/api/payment/demo/route";
import { setupTestDb } from "./helpers/db";
import { createTestOrder, orderState } from "./helpers/orders";

setupTestDb();

const KEYS = ["PAYMENT_PROVIDER", "AKBANK_MERCHANT_SAFE_ID", "AKBANK_TERMINAL_SAFE_ID", "AKBANK_SECRET_KEY", "AKBANK_ENV", "NODE_ENV"];
const saved: Record<string, string | undefined> = {};
before(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  // Ödeme sağlayıcısı tanımsız → demo banka
  for (const k of KEYS.slice(0, 5)) delete process.env[k];
});
after(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else (process.env as Record<string, string>)[k] = v;
  }
});

const APP = "http://localhost:3000";

async function startDemo() {
  const { order, variant } = await createTestOrder({ priceKurus: 32_890 });
  const r = await startCardPayment(order.id, { appUrl: APP });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error("başlatılamadı");
  const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: order.id } });
  return { order, variant, attempt, redirectUrl: r.redirectUrl };
}

const returnRequest = (attemptId: string) =>
  new NextRequest(`${APP}/api/payment/verify?attempt=${attemptId}&token=${attemptId}`);

function apiRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${APP}/api/payment/demo`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-host": "localhost:3000", ...headers },
  });
}

async function withNodeEnv<T>(value: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = value;
  try {
    return await fn();
  } finally {
    (process.env as Record<string, string>).NODE_ENV = prev ?? "test";
  }
}

test("kip: sağlayıcı tanımsızsa ya da Akbank bilgileri eksikse demo; bilinmeyen sağlayıcı kapalı", () => {
  assert.equal(cardPaymentMode(), "demo");
  assert.equal(getPaymentProvider().name, "demo");
  assert.equal(isTestProvider("demo"), true, "demo ödeme gerçek para sayılmaz (ciro, iade kuralları)");
  assert.match(paymentProviderStatus().note, /demo kopyası/);
  process.env.PAYMENT_PROVIDER = "akbank";
  try {
    assert.equal(cardPaymentMode(), "demo", "Akbank bilgileri girilene kadar demo");
    process.env.PAYMENT_PROVIDER = "bilinmeyen";
    assert.equal(cardPaymentMode(), "off");
  } finally {
    delete process.env.PAYMENT_PROVIDER;
  }
});

test("erişim: geliştirmede demo herkese açık; canlı sunucuda oturumsuz ziyaretçi kartı 'yakında' görür, demo uçları kapalı", async () => {
  assert.equal(await cardAvailabilityForRequest(), "demo");
  const card = availablePaymentOptions(DEFAULT_PAYMENT_SETTINGS, "demo").find((o) => o.id === "CARD")!;
  assert.equal(card.available, true);
  assert.equal(card.demoMode, true);

  const { attempt } = await startDemo();
  await withNodeEnv("production", async () => {
    assert.equal(await cardAvailabilityForRequest(), "unavailable");
    const session = await loadDemoSession(attempt.id);
    assert.equal(session.ok, false);
    assert.equal(!session.ok && session.reason, "forbidden");
    const sent = await sendDemoCode(attempt.id);
    assert.equal(sent.ok, false);
    assert.equal(!sent.ok && sent.httpStatus, 403);
  });
});

test("baştan sona: demo sayfası → kod → doğru kodla onay → dönüşte sunucu sorgusu → sipariş PAID", async () => {
  const { order, attempt, redirectUrl } = await startDemo();
  assert.equal(attempt.provider, "demo");
  assert.equal(attempt.providerToken, attempt.id);
  assert.equal(redirectUrl, `${APP}/demo-odeme/${attempt.id}`);

  const session = await loadDemoSession(attempt.id);
  assert.equal(session.ok, true);
  if (!session.ok) return;
  assert.equal(session.amountKurus, order.totalKurus);
  assert.equal(session.phoneHint, "0532 *** ** 00");

  const sent = await sendDemoCode(attempt.id);
  assert.equal(sent.ok && sent.status, "code_sent");
  if (!sent.ok || sent.status !== "code_sent") return;
  assert.match(sent.code, /^\d{6}$/);

  const wrongCode = sent.code === "000000" ? "111111" : "000000";
  const wrong = await verifyDemoCode(attempt.id, wrongCode);
  assert.equal(wrong.ok, false);
  assert.equal(!wrong.ok && wrong.triesLeft, 2);

  const ok = await verifyDemoCode(attempt.id, sent.code);
  assert.equal(ok.ok && ok.status, "approved");
  assert.equal(ok.ok && "redirect" in ok && ok.redirect, `/api/payment/verify?attempt=${attempt.id}&token=${attempt.id}`);
  assert.equal((await orderState(order.id)).status, "PENDING", "onay tek başına siparişi ödenmiş yapmaz");

  const res = await verifyReturn(returnRequest(attempt.id));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), `${APP}/siparis/${order.reference}`);
  assert.equal((await orderState(order.id)).status, "PAID");
  const a = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.equal(a.status, "SUCCEEDED");
  assert.equal(a.paidAmountKurus, order.totalKurus);
  assert.ok(a.providerPaymentId?.startsWith(`demo:${attempt.id}:`));

  // Sonuçlanmış denemeye ikinci karar yazılamaz; sayfa yenilenirse dönüş adresine yönlendirilir
  const again = await verifyDemoCode(attempt.id, sent.code);
  assert.equal(again.ok, false);
  assert.equal(!again.ok && again.redirect, `/api/payment/verify?attempt=${attempt.id}&token=${attempt.id}`);

  const events = await prisma.paymentEvent.findMany({ where: { attemptId: attempt.id }, select: { eventType: true, payload: true } });
  assert.deepEqual(
    events.map((e) => e.eventType).filter((t) => t.startsWith("demo.")).sort(),
    ["demo.approved", "demo.code_sent", "demo.code_wrong"]
  );
  assert.ok(!JSON.stringify(events).includes(sent.code), "kod kayda düz metin yazılmaz");
});

test("yanlış kod 3 kez: ödeme reddedilir, müşteri ödeme adımına hata ile döner, sipariş PENDING", async () => {
  const { order, attempt } = await startDemo();
  const sent = await sendDemoCode(attempt.id);
  assert.ok(sent.ok && sent.status === "code_sent");
  const wrongCode = sent.ok && sent.status === "code_sent" && sent.code === "999999" ? "888888" : "999999";
  assert.equal((await verifyDemoCode(attempt.id, wrongCode)).ok, false);
  assert.equal((await verifyDemoCode(attempt.id, wrongCode)).ok, false);
  const third = await verifyDemoCode(attempt.id, wrongCode);
  assert.equal(third.ok && third.status, "declined");

  const res = await verifyReturn(returnRequest(attempt.id));
  assert.equal(res.headers.get("location"), `${APP}/odeme?error=payment_failed`);
  assert.equal((await orderState(order.id)).status, "PENDING");
  assert.equal((await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status, "FAILED");
});

test("onaysız dönüş ödenmiş yapmaz; yeniden kod sınırı; süresi dolan kod; vazgeç → ret", async () => {
  const { order, attempt } = await startDemo();
  // Sayfada henüz onay yokken biri dönüş adresini açtı: "doğrulanıyor", sipariş ödenmemiş
  const early = await verifyReturn(returnRequest(attempt.id));
  assert.equal(early.headers.get("location"), `${APP}/siparis/${order.reference}?odeme=dogrulaniyor`);
  assert.equal((await orderState(order.id)).status, "PENDING");

  const first = await sendDemoCode(attempt.id);
  assert.equal(first.ok, true);
  const tooSoon = await sendDemoCode(attempt.id);
  assert.equal(!tooSoon.ok && tooSoon.httpStatus, 429);

  // Kodun süresi doldu
  const sentEvent = await prisma.paymentEvent.findFirstOrThrow({ where: { attemptId: attempt.id, eventType: "demo.code_sent" } });
  await prisma.paymentEvent.update({
    where: { id: sentEvent.id },
    data: { payload: { ...(sentEvent.payload as Record<string, unknown>), expiresAt: new Date(Date.now() - 1000).toISOString() } },
  });
  const expired = await verifyDemoCode(attempt.id, first.ok && first.status === "code_sent" ? first.code : "000000");
  assert.equal(!expired.ok && expired.httpStatus, 409);

  const cancelled = await cancelDemoPayment(attempt.id);
  assert.equal(cancelled.ok && cancelled.status, "declined");
  const res = await verifyReturn(returnRequest(attempt.id));
  assert.equal(res.headers.get("location"), `${APP}/odeme?error=payment_failed`);
  assert.equal((await orderState(order.id)).status, "PENDING");
});

test("tarayıcı dönmese de zamanlanmış sorgu onaylanmış demo ödemeyi bulur", async () => {
  const { order, attempt } = await startDemo();
  const sent = await sendDemoCode(attempt.id);
  assert.ok(sent.ok && sent.status === "code_sent");
  if (!sent.ok || sent.status !== "code_sent") return;
  assert.equal((await verifyDemoCode(attempt.id, sent.code)).ok, true);
  const auto = await reconcilePendingCardPayments({ minAgeMs: 0 });
  assert.equal(auto.outcomes.paid, 1);
  assert.equal((await orderState(order.id)).status, "PAID");
});

test("API: başka siteden istek reddedilir, kod 6 hane olmalı, kod gönderimi çalışır", async () => {
  const { attempt } = await startDemo();
  const cross = await demoApi(apiRequest({ action: "send-code", attemptId: attempt.id }, { origin: "https://baska-site.example" }));
  assert.equal(cross.status, 403);
  const badCode = await demoApi(apiRequest({ action: "verify-code", attemptId: attempt.id, code: "12ab56" }));
  assert.equal(badCode.status, 400);
  const sent = await demoApi(apiRequest({ action: "send-code", attemptId: attempt.id }, { origin: APP }));
  assert.equal(sent.status, 200);
  const body = (await sent.json()) as { status: string; code: string };
  assert.equal(body.status, "code_sent");
  assert.match(body.code, /^\d{6}$/);
  const unknown = await demoApi(apiRequest({ action: "send-code", attemptId: "olmayan-deneme" }));
  assert.equal(unknown.status, 404);
});

test("telefon maskesi yalnız ilk ve son haneleri gösterir", () => {
  assert.equal(maskPhone("+905320000000"), "0532 *** ** 00");
  assert.equal(maskPhone("0551 388 95 10"), "0551 *** ** 10");
  assert.equal(maskPhone("5513889510"), "0551 *** ** 10");
  assert.equal(maskPhone("123"), null);
  assert.equal(maskPhone(null), null);
});
