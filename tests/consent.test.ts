/**
 * Mesafeli satış sözleşmesi (+ ön bilgilendirme formu) onayı: sipariş onaysız açılmaz;
 * onay belge + sürüm + zaman + IP olarak siparişle aynı transaction'da yazılır.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { POST as checkout } from "@/app/api/checkout/route";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import { createProduct, setupTestDb } from "./helpers/db";
import { checkoutBody, jsonRequest } from "./helpers/http";

setupTestDb();

const URL = "http://localhost:3000/api/checkout";

test("onay verilirse iki belge sürüm, zaman ve IP ile kaydedilir", async () => {
  const { variant } = await createProduct({ priceKurus: 10_000, stock: 5 });
  const before = Date.now();
  const res = await checkout(
    jsonRequest(URL, checkoutBody([{ variantId: variant.id, quantity: 1 }]), { "x-forwarded-for": "203.0.113.7, 10.0.0.1" })
  );
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));

  const consents = await prisma.orderConsent.findMany({ where: { orderId: body.orderId }, orderBy: { document: "asc" } });
  assert.deepEqual(
    consents.map((c) => [c.document, c.version, c.ipAddress]),
    [
      ["DISTANCE_SALES_CONTRACT", LEGAL_DOCUMENTS.DISTANCE_SALES_CONTRACT.version, "203.0.113.7"],
      ["PRE_INFORMATION_FORM", LEGAL_DOCUMENTS.PRE_INFORMATION_FORM.version, "203.0.113.7"],
    ]
  );
  for (const c of consents) {
    assert.ok(c.acceptedAt.getTime() >= before - 1000 && c.acceptedAt.getTime() <= Date.now() + 1000);
  }
});

test("onay kutusu işaretlenmemişse sipariş açılmaz, stok düşmez", async () => {
  const { variant } = await createProduct({ priceKurus: 10_000, stock: 5 });
  const res = await checkout(jsonRequest(URL, checkoutBody([{ variantId: variant.id, quantity: 1 }], { acceptTerms: false })));
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.ok(body.fieldErrors?.acceptTerms);
  assert.equal(await prisma.order.count(), 0);
  assert.equal(await prisma.orderConsent.count(), 0);
});

test("onay alanı hiç yoksa (eski ödeme sayfası) sayfayı yenilemesi istenir", async () => {
  const { variant } = await createProduct({ priceKurus: 10_000, stock: 5 });
  const body = checkoutBody([{ variantId: variant.id, quantity: 1 }]);
  delete body.acceptTerms;
  delete body.termsVersion;
  const res = await checkout(jsonRequest(URL, body));
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "CLIENT_OUTDATED");
  assert.equal(await prisma.order.count(), 0);
});

test("müşterinin gördüğü sözleşme sürümü eskiyse onay geçersiz", async () => {
  const { variant } = await createProduct({ priceKurus: 10_000, stock: 5 });
  const res = await checkout(jsonRequest(URL, checkoutBody([{ variantId: variant.id, quantity: 1 }], { termsVersion: "2020-01-01+2020-01-01" })));
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "TERMS_OUTDATED");
  assert.equal(await prisma.order.count(), 0);
});
