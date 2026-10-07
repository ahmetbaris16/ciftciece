/**
 * Ödeme yöntemleri: kapıda ödeme sunulmaz (2026-10-07). Eski ayar kaydında açık kalmış olsa da müşteriye
 * gösterilmez; ödeme isteği kapıda ödemeyle gelirse sipariş açılmaz.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { POST as checkout } from "@/app/api/checkout/route";
import { PAYMENT_METHOD_LABELS, availablePaymentOptions, parsePaymentSettings } from "@/lib/payment/methods";
import { createProduct, enableBankTransfer, setupTestDb } from "./helpers/db";
import { checkoutBody, jsonRequest } from "./helpers/http";

setupTestDb();

const OLD_SETTINGS_WITH_COD = JSON.stringify({
  card: { enabled: true, maxInstallment: 6 },
  bankTransfer: { enabled: true, bankName: "Test Bankası", accountHolder: "Test", iban: "TR330006100519786457841326", paymentWindowHours: 48 },
  cashOnDelivery: { enabled: true, feeKurus: 2_500, maxOrderKurus: null },
});

test("eski ayarda kapıda ödeme açık olsa da yöntemler yalnız kart ve havale", () => {
  const settings = parsePaymentSettings(OLD_SETTINGS_WITH_COD);
  assert.equal("cashOnDelivery" in settings, false);
  for (const card of ["ready", "test", "demo", "unavailable"] as const) {
    const ids = availablePaymentOptions(settings, card).map((o) => o.id);
    assert.deepEqual(ids, ["CARD", "BANK_TRANSFER"]);
  }
  // Eski siparişler için etiket durur
  assert.equal(PAYMENT_METHOD_LABELS.CASH_ON_DELIVERY, "Kapıda Ödeme");
});

test("kapıda ödemeyle gelen sipariş isteği reddedilir, sipariş açılmaz", async () => {
  await enableBankTransfer();
  await prisma.siteSetting.update({ where: { key: "payment" }, data: { value: OLD_SETTINGS_WITH_COD } });
  const { variant } = await createProduct({ priceKurus: 10_000, stock: 5 });
  const res = await checkout(
    jsonRequest("http://localhost/api/checkout", checkoutBody([{ variantId: variant.id, quantity: 1 }], { paymentMethod: "CASH_ON_DELIVERY" }))
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.fieldErrors?.paymentMethod, "ödeme yöntemi alan hatası");
  assert.equal(await prisma.order.count(), 0);
});
