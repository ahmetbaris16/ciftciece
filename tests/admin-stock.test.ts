/**
 * Admin stok yazımı (R-06): admin düzenleme sayfasını açtıktan sonra satış olursa, sayfadaki eski stok
 * değeri satılan ürünü stoğa geri eklememeli. Yazım koşulludur (görülen değer hâlâ geçerliyse).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import {
  StockChangedError,
  updateVariantAndStock,
  writeStockBulk,
} from "@/lib/repositories/inventory.repository";
import { POST as checkout } from "@/app/api/checkout/route";
import { createProduct, enableBankTransfer, setupTestDb, stockOf } from "./helpers/db";
import { checkoutBody, jsonRequest } from "./helpers/http";

setupTestDb();

async function sellOne(variantId: string) {
  await enableBankTransfer();
  const res = await checkout(jsonRequest("http://localhost/api/checkout", checkoutBody([{ variantId, quantity: 1 }], { paymentMethod: "BANK_TRANSFER" })));
  assert.equal(res.status, 200, `checkout ${res.status}`);
}

test("sayfa açıkken satış oldu, admin yalnız fiyatı değiştirdi: stok ezilmez", async () => {
  const { product, variant } = await createProduct({ priceKurus: 10_000, stock: 15 });
  // Admin sayfayı açtı (stok 15 gördü); bu arada 1 satış
  await sellOne(variant.id);
  assert.equal(await stockOf(variant.id), 14);
  // Form stok değişmediği için stok göndermez
  await updateVariantAndStock(product.id, variant.id, { priceKurus: 11_000 });
  assert.equal(await stockOf(variant.id), 14);
  assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).priceKurus, 11_000);
});

test("sayfa açıkken satış oldu, admin stoğu değiştirdi: yazılmaz, fiyat değişikliği de geri alınır", async () => {
  const { product, variant } = await createProduct({ priceKurus: 10_000, stock: 15 });
  await sellOne(variant.id);
  await assert.rejects(
    updateVariantAndStock(product.id, variant.id, { priceKurus: 12_000 }, { expected: 15, quantity: 20 }),
    (err: unknown) => err instanceof StockChangedError && err.conflicts[0]?.current === 14
  );
  assert.equal(await stockOf(variant.id), 14);
  assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).priceKurus, 10_000);
});

test("stok bu arada değişmediyse admin'in yazdığı değer yazılır", async () => {
  const { product, variant } = await createProduct({ priceKurus: 10_000, stock: 15 });
  await updateVariantAndStock(product.id, variant.id, {}, { expected: 15, quantity: 40 });
  assert.equal(await stockOf(variant.id), 40);
});

test("başka ürünün varyantı bu üründen güncellenemez", async () => {
  const a = await createProduct({ priceKurus: 10_000, stock: 5 });
  const b = await createProduct({ priceKurus: 10_000, stock: 5 });
  assert.equal(await updateVariantAndStock(a.product.id, b.variant.id, { priceKurus: 1 }, { expected: 5, quantity: 9 }), null);
  assert.equal(await stockOf(b.variant.id), 5);
});

test("toplu stok: bir satır bile değiştiyse hiçbiri yazılmaz", async () => {
  const a = await createProduct({ priceKurus: 10_000, stock: 10 });
  const b = await createProduct({ priceKurus: 10_000, stock: 10 });
  await sellOne(b.variant.id);
  await assert.rejects(
    writeStockBulk([
      { variantId: a.variant.id, expected: 10, quantity: 30 },
      { variantId: b.variant.id, expected: 10, quantity: 30 },
    ]),
    (err: unknown) => err instanceof StockChangedError && err.conflicts.length === 1 && err.conflicts[0].variantId === b.variant.id
  );
  assert.equal(await stockOf(a.variant.id), 10);
  assert.equal(await stockOf(b.variant.id), 9);

  await writeStockBulk([
    { variantId: a.variant.id, expected: 10, quantity: 30 },
    { variantId: b.variant.id, expected: 9, quantity: 30 },
  ]);
  assert.equal(await stockOf(a.variant.id), 30);
  assert.equal(await stockOf(b.variant.id), 30);
});

test("admin kaydıyla eşzamanlı satış: stok ya admin'in değeri ya da satış düşülmüş değer, ikisi birden asla", async () => {
  const { product, variant } = await createProduct({ priceKurus: 10_000, stock: 15 });
  await enableBankTransfer();
  const [adminResult, saleResult] = await Promise.allSettled([
    updateVariantAndStock(product.id, variant.id, {}, { expected: 15, quantity: 20 }),
    checkout(jsonRequest("http://localhost/api/checkout", checkoutBody([{ variantId: variant.id, quantity: 1 }], { paymentMethod: "BANK_TRANSFER" }))),
  ]);
  assert.equal(saleResult.status === "fulfilled" && saleResult.value.status, 200);
  const stock = await stockOf(variant.id);
  if (adminResult.status === "fulfilled") {
    // Önce admin yazdı (20), satış onun üzerine düştü
    assert.equal(stock, 19);
  } else {
    // Satış önce düştü (14), admin'in 15'e dayanan yazımı reddedildi
    assert.ok(adminResult.reason instanceof StockChangedError);
    assert.equal(stock, 14);
  }
});
