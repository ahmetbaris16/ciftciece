/**
 * Üye olmadan verilmiş siparişin tek kullanımlık değerlendirme kodu (F-33): sipariş numarası tek başına değerlendirme
 * yazdırmaz; paket fişindeki / teslim e-postasındaki kod bir kez kullanılır, kullanan tarayıcıya süreli izin verilir.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { POST as reviewCodeApi } from "@/app/api/reviews/code/route";
import {
  addGrantToCookie,
  ensureReviewCode,
  hasReviewGrant,
  normalizeReviewCode,
  parseGrantCookie,
  redeemReviewCode,
  regenerateReviewCode,
  reviewCodeUsed,
} from "@/lib/reviews/review-code";
import { setupTestDb } from "./helpers/db";
import { jsonRequest } from "./helpers/http";
import { createTestOrder } from "./helpers/orders";

setupTestDb();

const CODE = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

async function guestOrder(status: "SHIPPED" | "DELIVERED" | "CANCELLED" = "DELIVERED") {
  const { order } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  await prisma.order.update({ where: { id: order.id }, data: { status } });
  return order;
}

test("kod yazımı: büyük/küçük harf, boşluk ve tire fark etmez; O→0, I/L→1; uzunluk ve harf denetimi", () => {
  assert.equal(normalizeReviewCode("7k2m-q9xa"), "7K2MQ9XA");
  assert.equal(normalizeReviewCode(" 7K2M Q9XA "), "7K2MQ9XA");
  assert.equal(normalizeReviewCode("OOOO-ILIL"), "00001111");
  assert.equal(normalizeReviewCode("7K2M-Q9X"), null);
  assert.equal(normalizeReviewCode("7K2M-Q9XAB"), null);
  assert.equal(normalizeReviewCode("7K2M-Q9XU"), null); // U alfabede yok
  assert.equal(normalizeReviewCode(""), null);
});

test("misafir siparişinde kod bir kez oluşur ve hep aynıdır (fiş yeniden basılınca aynı kod); üyelik siparişinde kod yok", async () => {
  const order = await guestOrder("SHIPPED");
  const a = await ensureReviewCode(order.id);
  const b = await ensureReviewCode(order.id);
  assert.ok(a && b);
  assert.match(a.code, CODE);
  assert.equal(b.code, a.code);
  assert.equal(a.version, 1);
  assert.equal(await prisma.orderReviewCode.count({ where: { orderId: order.id } }), 1);
  // Veritabanında kodun kendisi yok, yalnız özeti
  const row = await prisma.orderReviewCode.findUniqueOrThrow({ where: { orderId: order.id } });
  assert.notEqual(row.codeHash, a.code.replace("-", ""));
  assert.equal(row.codeHash.length, 64);

  const member = await prisma.user.create({ data: { email: "kodsuz-uye@example.test", name: "Üye", role: "CUSTOMER", passwordHash: "x" } });
  const memberOrder = await guestOrder();
  await prisma.order.update({ where: { id: memberOrder.id }, data: { userId: member.id } });
  assert.equal(await ensureReviewCode(memberOrder.id), null);
  assert.equal(await ensureReviewCode("olmayan-siparis"), null);
});

test("tek kullanım: teslimden önce harcanmaz; teslimde bir kez kullanılır, ikinci kişi kullanamaz; aynı tarayıcı izinle devam eder", async () => {
  const order = await guestOrder("SHIPPED");
  const { code } = (await ensureReviewCode(order.id))!;

  // Teslim edilmeden: kullanılamaz ve harcanmaz
  assert.deepEqual(await redeemReviewCode(code), { ok: false, reason: "not_delivered" });
  assert.equal(await reviewCodeUsed(order.id), false);

  await prisma.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });
  // Başka siparişin sayfasında ya da hatalı kod: harcanmaz
  assert.deepEqual(await redeemReviewCode(code, { orderRef: "baska-siparis" }), { ok: false, reason: "invalid" });
  assert.deepEqual(await redeemReviewCode("ZZZZ-ZZZZ"), { ok: false, reason: "invalid" });
  assert.equal(await reviewCodeUsed(order.id), false);

  const first = await redeemReviewCode(code.toLowerCase().replace("-", " "), { orderRef: order.reference });
  assert.ok(first.ok && first.grantToken);
  assert.equal(first.reference, order.reference);
  assert.equal(await reviewCodeUsed(order.id), true);
  assert.equal(await hasReviewGrant(order.id, [first.grantToken]), true);

  // İkinci kişi (izni olmayan tarayıcı): kod kullanıldı
  assert.deepEqual(await redeemReviewCode(code), { ok: false, reason: "used" });
  assert.equal(await hasReviewGrant(order.id, ["baska-tarayicinin-anahtari-xyz"]), false);
  assert.equal(await hasReviewGrant(order.id, []), false);

  // Kodu kullanan tarayıcı kodu yeniden girerse: kod yeniden harcanmaz, aynı izinle devam
  const again = await redeemReviewCode(code, { tokens: [first.grantToken] });
  assert.ok(again.ok);
  assert.equal(again.grantToken, null);
  assert.equal(await hasReviewGrant(order.id, [first.grantToken]), true);

  // İzin 30 gün sonra biter
  const later = new Date(Date.now() + 31 * 24 * 60 * 60_000);
  assert.equal(await hasReviewGrant(order.id, [first.grantToken], later), false);
});

test("aynı anda iki kullanım: yalnız biri kazanır", async () => {
  const order = await guestOrder();
  const { code } = (await ensureReviewCode(order.id))!;
  const results = await Promise.all([redeemReviewCode(code), redeemReviewCode(code), redeemReviewCode(code)]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.filter((r) => !r.ok && r.reason === "used").length, 2);
});

test("yönetici yeni kod üretir: eski kod ve verilmiş izin geçersiz, yeni kod çalışır; iptal edilmiş siparişte kod çalışmaz", async () => {
  const order = await guestOrder();
  const old = (await ensureReviewCode(order.id))!;
  const first = await redeemReviewCode(old.code);
  assert.ok(first.ok && first.grantToken);

  const next = await regenerateReviewCode(order.id);
  assert.ok(next);
  assert.equal(next.version, 2);
  assert.notEqual(next.code, old.code);
  assert.equal(next.usedAt, null);
  assert.equal((await ensureReviewCode(order.id))?.code, next.code);
  assert.equal(await hasReviewGrant(order.id, [first.grantToken]), false);
  assert.deepEqual(await redeemReviewCode(old.code), { ok: false, reason: "invalid" });
  const second = await redeemReviewCode(next.code);
  assert.ok(second.ok && second.grantToken);
  assert.equal(await hasReviewGrant(order.id, [second.grantToken]), true);

  const cancelled = await guestOrder("CANCELLED");
  const c = (await ensureReviewCode(cancelled.id))!;
  assert.deepEqual(await redeemReviewCode(c.code), { ok: false, reason: "closed" });
});

test("izin çerezi: en yeni önce, en çok 5 sipariş, bozuk değerler atılır", () => {
  const t = (n: number) => `anahtar${String(n).padStart(2, "0")}-abcdefghijklmnop`;
  let cookie = "";
  for (let i = 1; i <= 7; i++) cookie = addGrantToCookie(cookie, t(i));
  assert.deepEqual(parseGrantCookie(cookie), [t(7), t(6), t(5), t(4), t(3)]);
  assert.deepEqual(parseGrantCookie(addGrantToCookie(cookie, t(5))).slice(0, 2), [t(5), t(7)]);
  assert.deepEqual(parseGrantCookie(`kisa.${t(1)}.<script>`), [t(1)]);
  assert.deepEqual(parseGrantCookie(undefined), []);
});

test("API: hatalı kod 400, teslim edilmemiş 403, doğru kod çerez + sipariş no, kullanılmış kod 409, başka site 403", async () => {
  const order = await guestOrder("SHIPPED");
  const { code } = (await ensureReviewCode(order.id))!;
  const call = (body: unknown, headers: Record<string, string> = {}) =>
    reviewCodeApi(jsonRequest("http://localhost/api/reviews/code", body, headers));

  assert.equal((await call({ code: "1234" })).status, 400);
  const early = await call({ code });
  assert.equal(early.status, 403);
  assert.equal((await early.json()).reason, "not_delivered");

  await prisma.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });
  const cross = await call({ code }, { origin: "https://baska-site.example", host: "localhost" });
  assert.equal(cross.status, 403);
  assert.equal(await reviewCodeUsed(order.id), false);

  const ok = await call({ code });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).reference, order.reference);
  const setCookie = ok.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /ce_review_grants=[A-Za-z0-9_-]{20,}/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=lax/i);

  const used = await call({ code });
  assert.equal(used.status, 409);
  assert.equal((await used.json()).reason, "used");

  // Kodu kullanan tarayıcı (çerezle) yeniden girerse 200, çerez değişmez
  const sameBrowser = await call({ code }, { cookie: setCookie.split(";")[0] });
  assert.equal(sameBrowser.status, 200);
  assert.equal(sameBrowser.headers.get("set-cookie"), null);
});
