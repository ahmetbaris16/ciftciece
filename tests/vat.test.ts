/**
 * KDV oranı (Y-12): admin formundaki yüzde ↔ baz puan; kayıt ürüne yazılır, siparişe kopyalanır.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { parseVatPercent, vatBpsToPercent } from "@/lib/catalog/vat";
import { getProductByIdForAdmin } from "@/lib/repositories";
import { createProduct, setupTestDb } from "./helpers/db";

setupTestDb();

test("elle yazılan oran → baz puan: boş = girilmemiş, geçersiz giriş 'girilmemiş' diye geçmez", () => {
  assert.deepEqual(parseVatPercent(""), { ok: true, bps: null });
  assert.deepEqual(parseVatPercent("   "), { ok: true, bps: null });
  assert.deepEqual(parseVatPercent("0"), { ok: true, bps: 0 });
  assert.deepEqual(parseVatPercent("1"), { ok: true, bps: 100 });
  assert.deepEqual(parseVatPercent(" 20 "), { ok: true, bps: 2000 });
  assert.deepEqual(parseVatPercent("%10"), { ok: true, bps: 1000 });
  assert.deepEqual(parseVatPercent("8 %"), { ok: true, bps: 800 });
  assert.deepEqual(parseVatPercent("100"), { ok: true, bps: 10_000 });
  for (const bad of ["7.5", "7,5", "101", "-1", "1e1", "on", "%", "10%%"]) {
    assert.equal(parseVatPercent(bad).ok, false, `"${bad}" kabul edilmemeli`);
  }
  assert.equal(vatBpsToPercent(null), "");
  assert.equal(vatBpsToPercent(1000), "10");
});

test("admin ürün kaydı KDV oranını taşır (formun okuduğu değer)", async () => {
  const { product } = await createProduct({ priceKurus: 10_000, stock: 1 });
  assert.equal((await getProductByIdForAdmin(product.id))?.vatRateBps, null);
  await prisma.product.update({ where: { id: product.id }, data: { vatRateBps: 1000 } });
  assert.equal((await getProductByIdForAdmin(product.id))?.vatRateBps, 1000);
});
