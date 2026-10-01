/**
 * Idempotent checkout (R-05): aynı anahtarla ikinci istek yeni sipariş açmaz, mevcudu döner.
 * Son savunma hattı DB'deki UNIQUE kısıttır — eşzamanlı istekler dahil.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { POST as checkout } from "@/app/api/checkout/route";
import { createOrder } from "@/lib/repositories/order.repository";
import { createProduct, setupTestDb, stockOf } from "./helpers/db";
import { checkoutBody, jsonRequest } from "./helpers/http";

setupTestDb();

const URL = "http://localhost:3000/api/checkout";

async function send(body: Record<string, unknown>) {
  const res = await checkout(jsonRequest(URL, body));
  return { status: res.status, body: await res.json() };
}

test("aynı checkout iki kez gönderiliyor (sırayla): tek sipariş, stok bir kez düşer", async () => {
  const { variant } = await createProduct({ priceKurus: 10_000, stock: 5 });
  const body = checkoutBody([{ variantId: variant.id, quantity: 2 }], { idempotencyKey: randomUUID() });

  const first = await send(body);
  const second = await send(body);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.orderId, first.body.orderId);
  assert.equal(second.body.replayed, true);
  assert.equal(second.body.nextStep, "pay");
  assert.equal(await prisma.order.count(), 1);
  assert.equal(await stockOf(variant.id), 3);
  assert.equal(await prisma.orderConsent.count(), 2, "onay kaydı ikilenmez");
});

test("aynı checkout iki kez gönderiliyor (eşzamanlı, 5 istek): tek sipariş", async () => {
  const { variant } = await createProduct({ priceKurus: 10_000, stock: 50 });
  const body = checkoutBody([{ variantId: variant.id, quantity: 3 }], { idempotencyKey: randomUUID() });

  const results = await Promise.all(Array.from({ length: 5 }, () => send(body)));
  for (const r of results) assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(new Set(results.map((r) => r.body.orderId)).size, 1);
  assert.equal(await prisma.order.count(), 1);
  assert.equal(await stockOf(variant.id), 47);
});

test("son ürün: aynı anahtarlı eşzamanlı iki istekte ikincisi stok hatası değil aynı siparişi alır", async () => {
  const { variant } = await createProduct({ priceKurus: 10_000, stock: 1 });
  const body = checkoutBody([{ variantId: variant.id, quantity: 1 }], { idempotencyKey: randomUUID() });

  const [a, b] = await Promise.all([send(body), send(body)]);
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(b.status, 200, JSON.stringify(b.body));
  assert.equal(a.body.orderId, b.body.orderId);
  assert.equal(await prisma.order.count(), 1);
  assert.equal(await stockOf(variant.id), 0);
});

test("aynı anahtar farklı içerikle: 409, yeni sipariş açılmaz", async () => {
  const { variant } = await createProduct({ priceKurus: 10_000, stock: 5 });
  const key = randomUUID();
  assert.equal((await send(checkoutBody([{ variantId: variant.id, quantity: 1 }], { idempotencyKey: key }))).status, 200);
  const other = await send(checkoutBody([{ variantId: variant.id, quantity: 2 }], { idempotencyKey: key }));
  assert.equal(other.status, 409);
  assert.equal(other.body.code, "IDEMPOTENCY_CONFLICT");
  assert.equal(await prisma.order.count(), 1);
  assert.equal(await stockOf(variant.id), 4);
});

test("anahtarı kapanmış siparişe ait istek: yeni sipariş için yeni anahtar istenir", async () => {
  const { variant } = await createProduct({ priceKurus: 10_000, stock: 5 });
  const body = checkoutBody([{ variantId: variant.id, quantity: 1 }], { idempotencyKey: randomUUID() });
  const first = await send(body);
  await prisma.order.update({ where: { id: first.body.orderId }, data: { status: "CANCELLED" } });
  const again = await send(body);
  assert.equal(again.status, 409);
  assert.equal(again.body.code, "ORDER_CLOSED");
  assert.equal(await prisma.order.count(), 1);
});

test("farklı anahtar farklı siparişdir", async () => {
  const { variant } = await createProduct({ priceKurus: 10_000, stock: 5 });
  await send(checkoutBody([{ variantId: variant.id, quantity: 1 }], { idempotencyKey: randomUUID() }));
  await send(checkoutBody([{ variantId: variant.id, quantity: 1 }], { idempotencyKey: randomUUID() }));
  assert.equal(await prisma.order.count(), 2);
});

test("son savunma hattı DB kısıtı: uygulama kontrolü atlansa da aynı anahtarla ikinci sipariş yazılamaz", async () => {
  const { variant } = await createProduct({ priceKurus: 10_000, stock: 5 });
  const key = randomUUID();
  const input = {
    guestEmail: "a@example.com",
    guestName: "A B",
    guestPhone: "+905320000000",
    shippingAddress: { firstName: "A", lastName: "B", phone: "+905320000000", city: "Bursa", district: "Orhangazi", address: "Adres satırı 12345" },
    items: [{ variantId: variant.id, snapshotName: "X", snapshotVariant: "1", snapshotPrice: 10_000, quantity: 1 }],
    subtotalKurus: 10_000,
    shippingKurus: 0,
    paymentMethod: "CARD" as const,
    paymentDueAt: new Date(Date.now() + 60_000),
    initialStatus: "PENDING" as const,
    idempotencyKey: key,
    idempotencyHash: "h",
  };
  const results = await Promise.allSettled([createOrder(input), createOrder(input)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
  assert.ok(rejected.reason instanceof Prisma.PrismaClientKnownRequestError && rejected.reason.code === "P2002");
  assert.equal(await prisma.order.count(), 1);
  assert.equal(await stockOf(variant.id), 4, "kısıta takılan ikinci sipariş stoğu da geri alır");
});

test("anahtarsız istek (bu sürümden önceki ödeme sayfası) eskisi gibi çalışır", async () => {
  const { variant } = await createProduct({ priceKurus: 10_000, stock: 5 });
  const body = checkoutBody([{ variantId: variant.id, quantity: 1 }]);
  assert.equal((await send(body)).status, 200);
  assert.equal((await send(body)).status, 200);
  assert.equal(await prisma.order.count(), 2, "anahtar yoksa koruma yok (geçiş dönemi; bkz. rapor)");
});
