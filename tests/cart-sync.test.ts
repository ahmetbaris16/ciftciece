/**
 * Sepet eşitleme: tarayıcıdaki sepet sunucudaki güncel bilgiyle karşılaştırılır. Kimliği bulunamayan
 * (ör. veritabanısız kipte eklenmiş "mock-var-..." ya da silinmiş) ürün ödemede "satışta değil" hatasına
 * yol açmadan önce sepetten çıkarılır; değişiklik müşteriye söylenir.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { POST } from "@/app/api/cart/route";
import { applyCartSync, type CartLine } from "@/lib/cart/sync";
import type { CartItem } from "@/types";
import { createProduct, setupTestDb } from "./helpers/db";
import { jsonRequest } from "./helpers/http";

setupTestDb();

const item = (variantId: string, over: Partial<CartItem> = {}): CartItem => ({
  variantId,
  productSlug: "eski-slug",
  productName: "Zeytinyağı",
  variantName: "1 L",
  priceKurus: 50_000,
  quantity: 2,
  imageUrl: "/eski.jpg",
  imageAlt: "eski",
  isAvailable: true,
  ...over,
});

const ok = (variantId: string, over: Partial<Extract<CartLine, { status: "ok" }>> = {}): CartLine => ({
  variantId,
  status: "ok",
  productSlug: "naturel-sizma",
  productName: "Zeytinyağı",
  variantName: "1 L",
  priceKurus: 50_000,
  maxQuantity: 30,
  imageUrl: "/yeni.jpg",
  imageAlt: "yeni",
  ...over,
});

async function sync(variantIds: string[]) {
  const res = await POST(jsonRequest("http://localhost/api/cart", { variantIds }));
  return { status: res.status, body: (await res.json()) as { lines?: CartLine[] } };
}

test("eşitleme: bulunamayan/satışta olmayan çıkar, fiyat ve ad güncellenir, adet stoğa iner", () => {
  const items = [
    item("mock-var-SYAG-1L", { productName: "Çiftçi Ece Naturel Sızma Zeytinyağı 1 L", variantName: "1 L Cam" }),
    item("v-kapali", { productName: "Turşu" }),
    item("v-bitti", { productName: "Sabun", variantName: "" }),
    item("v-fiyat", { quantity: 5 }),
    item("v-yeni-eklenen"),
  ];
  const { items: next, changes } = applyCartSync(items, [
    { variantId: "mock-var-SYAG-1L", status: "gone" },
    { variantId: "v-kapali", status: "unavailable" },
    { variantId: "v-bitti", status: "out_of_stock" },
    ok("v-fiyat", { priceKurus: 55_000, maxQuantity: 3, productName: "Zeytinyağı (yeni ad)" }),
  ]);

  assert.deepEqual(next.map((i) => i.variantId), ["v-fiyat", "v-yeni-eklenen"], "yanıtta olmayan kalem olduğu gibi kalır");
  const updated = next[0];
  assert.equal(updated.priceKurus, 55_000);
  assert.equal(updated.quantity, 3);
  assert.equal(updated.maxQuantity, 3);
  assert.equal(updated.productName, "Zeytinyağı (yeni ad)");
  assert.equal(updated.productSlug, "naturel-sizma");
  assert.equal(updated.imageUrl, "/yeni.jpg");
  assert.deepEqual(next[1], items[4]);

  assert.equal(changes.length, 5);
  assert.match(changes[0], /“Çiftçi Ece Naturel Sızma Zeytinyağı 1 L \(1 L Cam\)” artık bulunamadığı için sepetinizden çıkarıldı/);
  assert.match(changes[1], /“Turşu \(1 L\)” şu anda satışta olmadığı için/);
  assert.match(changes[2], /“Sabun” stokta kalmadığı için/);
  assert.match(changes[3], /fiyatı güncellendi: ₺550,00 \(önceden ₺500,00\)/);
  assert.match(changes[4], /stokta 3 adet var; sepetteki adet 3 yapıldı/);
});

test("eşitleme: değişiklik yoksa müşteriye bir şey söylenmez", () => {
  const items = [item("v1")];
  const { items: next, changes } = applyCartSync(items, [ok("v1", { productSlug: "eski-slug", imageUrl: "/eski.jpg", imageAlt: "eski" })]);
  assert.deepEqual(changes, []);
  assert.equal(next[0].quantity, 2);
  assert.equal(next[0].maxQuantity, 30);
});

test("POST /api/cart: veritabanındaki güncel duruma göre her kalemin durumu", async () => {
  const live = await createProduct({ name: "Naturel Sızma", variantName: "1 L Cam", priceKurus: 50_000, stock: 150 });
  const hidden = await createProduct({ priceKurus: 10_000, stock: 5 });
  await prisma.product.update({ where: { id: hidden.product.id }, data: { isPublished: false } });
  const closed = await createProduct({ priceKurus: 10_000, stock: 5 });
  await prisma.productVariant.update({ where: { id: closed.variant.id }, data: { isAvailable: false } });
  const noPrice = await createProduct({ priceKurus: 0, stock: 5 });
  const empty = await createProduct({ priceKurus: 10_000, stock: 0 });

  const { status, body } = await sync([
    live.variant.id,
    "mock-var-SYAG-1L",
    hidden.variant.id,
    closed.variant.id,
    noPrice.variant.id,
    empty.variant.id,
    live.variant.id,
  ]);
  assert.equal(status, 200);
  assert.deepEqual(
    body.lines?.map((l) => [l.variantId, l.status]),
    [
      [live.variant.id, "ok"],
      ["mock-var-SYAG-1L", "gone"],
      [hidden.variant.id, "unavailable"],
      [closed.variant.id, "unavailable"],
      [noPrice.variant.id, "unavailable"],
      [empty.variant.id, "out_of_stock"],
    ],
    "tekrarlanan kimlik bir kez döner"
  );
  const line = body.lines?.[0];
  assert.ok(line && line.status === "ok");
  assert.equal(line.productName, "Naturel Sızma");
  assert.equal(line.variantName, "1 L Cam");
  assert.equal(line.priceKurus, 50_000);
  assert.equal(line.maxQuantity, 99, "sepette en fazla 99 adet");
  assert.equal(line.productSlug, live.product.slug);
});

test("POST /api/cart: boş, 50'den fazla kalemli ya da eski biçimli istek 400 döner", async () => {
  assert.equal((await sync([])).status, 400);
  const tooMany = Array.from({ length: 51 }, (_, i) => `v${i}`);
  assert.equal((await sync(tooMany)).status, 400);
  const bad = await POST(jsonRequest("http://localhost/api/cart", { items: [{ variantId: "x", quantity: 1 }] }));
  assert.equal(bad.status, 400);
});
