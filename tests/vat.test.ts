/**
 * KDV oranı (Y-12): admin formundaki yüzde ↔ baz puan; kayıt ürüne yazılır, siparişe kopyalanır.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { vatBpsToPercent, vatPercentToBps } from "@/lib/catalog/vat";
import { getProductByIdForAdmin } from "@/lib/repositories";
import { createProduct, setupTestDb } from "./helpers/db";

setupTestDb();

test("yüzde ↔ baz puan: boş = girilmemiş, geçersiz değer kabul edilmez", () => {
  assert.equal(vatPercentToBps(""), null);
  assert.equal(vatPercentToBps("1"), 100);
  assert.equal(vatPercentToBps("20"), 2000);
  assert.equal(vatPercentToBps("7.5"), null);
  assert.equal(vatPercentToBps("101"), null);
  assert.equal(vatBpsToPercent(null), "");
  assert.equal(vatBpsToPercent(1000), "10");
});

test("admin ürün kaydı KDV oranını taşır (formun okuduğu değer)", async () => {
  const { product } = await createProduct({ priceKurus: 10_000, stock: 1 });
  assert.equal((await getProductByIdForAdmin(product.id))?.vatRateBps, null);
  await prisma.product.update({ where: { id: product.id }, data: { vatRateBps: 1000 } });
  assert.equal((await getProductByIdForAdmin(product.id))?.vatRateBps, 1000);
});
