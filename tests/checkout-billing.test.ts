/**
 * Ödeme adımı: fatura bilgisi (bireysel/kurumsal), sipariş notu, il listesi. Sunucu doğrular ve siparişe yazar.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { POST as checkout } from "@/app/api/checkout/route";
import { PROVINCES, PROVINCES_SORTED } from "@/lib/geo/provinces";
import { createProduct, enableBankTransfer, setupTestDb } from "./helpers/db";
import { checkoutBody, jsonRequest } from "./helpers/http";

setupTestDb();

async function order(extra: Record<string, unknown>) {
  await enableBankTransfer();
  const { variant } = await createProduct({ priceKurus: 10_000, stock: 10 });
  const res = await checkout(
    jsonRequest("http://localhost/api/checkout", checkoutBody([{ variantId: variant.id, quantity: 1 }], { paymentMethod: "BANK_TRANSFER", ...extra }))
  );
  return { res, body: await res.json() };
}

test("fatura bilgisi gönderilmezse bireysel, teslimattaki ad-soyad", async () => {
  const { res, body } = await order({});
  assert.equal(res.status, 200);
  const o = await prisma.order.findUniqueOrThrow({ where: { id: body.orderId } });
  assert.deepEqual(o.billingInfo, { type: "INDIVIDUAL", name: "Ayşe Yılmaz", sameAsShipping: true });
  assert.equal(o.customerNote, null);
});

test("kurumsal fatura ve sipariş notu siparişe yazılır", async () => {
  const { res, body } = await order({
    billing: { type: "CORPORATE", companyName: "Deneme Lokanta Ltd. Şti.", taxOffice: "Orhangazi", taxNumber: "123 456 7890", sameAsShipping: true },
    note: "Kapıcıya bırakılabilir.",
  });
  assert.equal(res.status, 200);
  const o = await prisma.order.findUniqueOrThrow({ where: { id: body.orderId } });
  const b = o.billingInfo as Record<string, unknown>;
  assert.equal(b.type, "CORPORATE");
  assert.equal(b.companyName, "Deneme Lokanta Ltd. Şti.");
  assert.equal(b.taxNumber, "1234567890");
  assert.equal(o.customerNote, "Kapıcıya bırakılabilir.");
});

test("kurumsal faturada eksik vergi bilgisi ve farklı fatura adresinde eksik adres: alan hatası", async () => {
  const bad = await order({ billing: { type: "CORPORATE", companyName: "X Ltd", taxOffice: "", taxNumber: "12", sameAsShipping: false } });
  assert.equal(bad.res.status, 400);
  assert.ok(bad.body.fieldErrors.taxOffice);
  assert.ok(bad.body.fieldErrors.taxNumber);
  assert.ok(bad.body.fieldErrors.billingAddress);
  assert.ok(bad.body.fieldErrors.billingCity);
  const longNote = await order({ note: "x".repeat(501) });
  assert.equal(longNote.res.status, 400);
  assert.ok(longNote.body.fieldErrors.note);
});

test("il listesi: 81 il, tekrarsız, Türkçe sıralı", () => {
  assert.equal(PROVINCES.length, 81);
  assert.equal(new Set(PROVINCES).size, 81);
  assert.equal(PROVINCES[15], "Bursa", "plaka 16");
  assert.equal(PROVINCES[80], "Düzce", "plaka 81");
  assert.equal(PROVINCES_SORTED[0], "Adana");
  assert.ok(PROVINCES_SORTED.indexOf("Çanakkale") < PROVINCES_SORTED.indexOf("Denizli"));
  assert.ok(PROVINCES_SORTED.indexOf("İstanbul") > PROVINCES_SORTED.indexOf("Iğdır"));
});
