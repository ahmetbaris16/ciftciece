/**
 * MariaDB'ye özgü davranışlar (Hostinger web hosting'in veritabanı; yerelde aynı sürüm, docs/TESTING.md).
 * PostgreSQL'den geçişte değişen ya da sessizce bozulabilecek noktalar burada sabitlenir:
 *  - işlem yalıtımı (READ COMMITTED), saat dilimi, uzun metinler, katı mod,
 *  - tekrar korumalı kayıt (INSERT IGNORE yerine açık yakalama), JSON alanları, Türkçe arama.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { raiseAlert } from "@/lib/payment/alerts";
import { writeOutbox } from "@/lib/outbox";
import { searchProducts } from "@/lib/repositories/search.repository";
import { createProduct, setupTestDb } from "./helpers/db";
import { createTestOrder } from "./helpers/orders";

setupTestDb();

test("işlemler READ COMMITTED: işlem sürerken başka işlemin onayladığı değişiklik sonraki okumada görünür", async () => {
  // REPEATABLE READ'de (MariaDB varsayılanı) ikinci okuma ilk okumanın anlık görüntüsünü, yani eski adı görürdü
  const { product } = await createProduct({ name: "Eski Ad", priceKurus: 10_000, stock: 1 });
  const seen = await prisma.$transaction(async (tx) => {
    const first = await tx.product.findUniqueOrThrow({ where: { id: product.id } });
    await prisma.product.update({ where: { id: product.id }, data: { name: "Yeni Ad" } }); // ayrı bağlantı, hemen onaylanır
    const second = await tx.product.findUniqueOrThrow({ where: { id: product.id } });
    return [first.name, second.name];
  });
  assert.deepEqual(seen, ["Eski Ad", "Yeni Ad"]);
});

test("tarihleri uygulama yazar: veritabanı sunucusunun saat dilimi kayıtları kaydırmaz", async () => {
  // Yerel sunucu bilerek +03:00'te (docs/TESTING.md); canlı sunucunun saat dilimi bilinmiyor
  const before = Date.now();
  const { order } = await createTestOrder({ dueInMinutes: 30 });
  const after = Date.now();
  const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.ok(saved.createdAt.getTime() >= before - 2_000 && saved.createdAt.getTime() <= after + 2_000);
  const dueMs = saved.paymentDueAt!.getTime() - saved.createdAt.getTime();
  assert.ok(Math.abs(dueMs - 30 * 60_000) < 5_000, `paymentDueAt - createdAt = ${dueMs} ms`);
});

test("uzun metinler kesilmeden saklanır (MySQL'de metin varsayılanı 191 karakter)", async () => {
  const long = (n: number) => "Çiftçi Ece zeytin ğüşıöç ".repeat(Math.ceil(n / 25)).slice(0, n);
  const { product } = await createProduct({ priceKurus: 10_000, stock: 1 });
  await prisma.product.update({ where: { id: product.id }, data: { description: long(5_000) } });
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).description, long(5_000));

  const value = JSON.stringify({ not: long(30_000) });
  await prisma.siteSetting.create({ data: { key: "uzun-ayar", value } });
  assert.equal((await prisma.siteSetting.findUniqueOrThrow({ where: { key: "uzun-ayar" } })).value, value);

  const { order } = await createTestOrder();
  const attempt = await prisma.paymentAttempt.create({
    data: { orderId: order.id, provider: "iyzico", method: "CARD", amountKurus: 23_900, status: "FAILED", failureReason: long(3_000) },
  });
  assert.equal((await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).failureReason, long(3_000));

  await prisma.$transaction((tx) =>
    raiseAlert(tx, { kind: "PAYMENT_MISMATCH", dedupeKey: `uzun:${order.id}`, message: long(2_000), orderId: order.id })
  );
  assert.equal((await prisma.paymentAlert.findUniqueOrThrow({ where: { dedupeKey: `uzun:${order.id}` } })).message, long(2_000));
});

test("katı mod: sütuna sığmayan değer kesilip yazılmaz, hata verir", async () => {
  const { product } = await createProduct({ priceKurus: 10_000, stock: 1 });
  await assert.rejects(
    prisma.product.update({ where: { id: product.id }, data: { name: "x".repeat(300) } }),
    (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2000"
  );
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).name, product.name);
});

test("aynı alarm ve bildirim olayı iki kez yazılmaz; tekrar işlemi bozmaz", async () => {
  const { order } = await createTestOrder();
  const result = await prisma.$transaction(async (tx) => {
    const first = await raiseAlert(tx, { kind: "FRAUD_REVIEW", dedupeKey: `tekrar:${order.id}`, message: "ilk", orderId: order.id });
    const second = await raiseAlert(tx, { kind: "FRAUD_REVIEW", dedupeKey: `tekrar:${order.id}`, message: "ikinci", orderId: order.id });
    const outboxAgain = await writeOutbox(tx, {
      topic: "payment.alert",
      aggregateType: "order",
      aggregateId: order.id,
      dedupeKey: `payment.alert:tekrar:${order.id}`,
      payload: { tekrar: true },
    });
    // Tekrardan sonra işlem hâlâ kullanılabilir olmalı
    await tx.order.update({ where: { id: order.id }, data: { notes: "işlem devam etti" } });
    return { first, second, outboxAgain };
  });
  assert.deepEqual(result, { first: true, second: false, outboxAgain: false });
  assert.equal(await prisma.paymentAlert.count({ where: { dedupeKey: `tekrar:${order.id}` } }), 1);
  assert.equal(await prisma.outboxEvent.count({ where: { dedupeKey: `payment.alert:tekrar:${order.id}` } }), 1);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).notes, "işlem devam etti");
});

test("eşzamanlı aynı alarm: tek kayıt, iki işlem de tamamlanır (UNIQUE ihlali yakalanır)", async () => {
  const key = `eszamanli:${Date.now()}`;
  const run = () =>
    prisma.$transaction(async (tx) => {
      const created = await raiseAlert(tx, { kind: "WEBHOOK_SIGNATURE_INVALID", dedupeKey: key, message: "imza tutmadı" });
      // İki işlem birbirini görsün diye kısa bekleme
      await new Promise((r) => setTimeout(r, 50));
      return created;
    });
  const results = await Promise.all([run(), run(), run()]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await prisma.paymentAlert.count({ where: { dedupeKey: key } }), 1);
  assert.equal(await prisma.outboxEvent.count({ where: { dedupeKey: `payment.alert:${key}` } }), 1);
});

test("JSON alanları (MariaDB'de LONGTEXT) nesne olarak geri okunur", async () => {
  const { order } = await createTestOrder();
  const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  const address = saved.shippingAddress as Record<string, unknown>;
  assert.equal(typeof address, "object");
  assert.equal(address.district, "Orhangazi");
  assert.equal(address.lastName, "Müşteri");
});

// Bilinen sınır: utf8mb4_unicode_ci noktasız "ı"yı "i"ye eşlemez ("KIZARTILMIŞ" ≠ "kızartılmış",
// "DAGLI" ≠ "Dağlı"). Düzeltmesi katlanmış bir arama sütunu ister; bu geçişin kapsamında değil.
test("Türkçe arama: büyük/küçük harf ve ş/ç/ğ/ü/ö farkı eşleşmeyi bozmaz", async () => {
  await createProduct({ name: "Gemlik Siyah Zeytin", priceKurus: 10_000, stock: 1 });
  await createProduct({ name: "Bülent Dağlı Kestane Şekeri", priceKurus: 10_000, stock: 1 });
  const names = async (q: string) => (await searchProducts(q)).map((p) => p.name).sort();
  assert.deepEqual(await names("ZEYTİN"), ["Gemlik Siyah Zeytin"]);
  assert.deepEqual(await names("zeytin"), ["Gemlik Siyah Zeytin"]);
  assert.deepEqual(await names("ZEYTIN"), ["Gemlik Siyah Zeytin"]);
  assert.deepEqual(await names("seker"), ["Bülent Dağlı Kestane Şekeri"]);
  assert.deepEqual(await names("BÜLENT"), ["Bülent Dağlı Kestane Şekeri"]);
});
