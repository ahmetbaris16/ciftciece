/**
 * Kargo: sabit ücret + ücretsiz kargo sınırı. Ücret girilmemişse alıcı ödemeli (tutar uydurulmaz). Eski sürümün
 * desi tarifesi/koli ayarları okunmaz ama kaydederken silinmez. Sipariş tutarı sunucudaki ayardan hesaplanır.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { POST as checkout } from "@/app/api/checkout/route";
import { POST as quoteRoute } from "@/app/api/shipping/quote/route";
import { parseShippingSettings, SHIPPING_SETTING_KEY } from "@/lib/shipping/settings";
import { quoteShipping, shippingModeOf } from "@/lib/shipping/quote";
import { getShippingSettings, saveShippingSettings } from "@/lib/shipping/shipping.repository";
import { createProduct, enableBankTransfer, setupTestDb } from "./helpers/db";
import { checkoutBody, jsonRequest } from "./helpers/http";

setupTestDb();

test("hesap: sınırın altında sabit ücret, sınırda ve üstünde ücretsiz, ücret girilmemişse alıcı ödemeli", () => {
  const settings = { feeKurus: 15_000, freeThresholdKurus: 300_000 };
  assert.deepEqual(
    [quoteShipping({ subtotalKurus: 10_000 }, settings).feeKurus, quoteShipping({ subtotalKurus: 299_999 }, settings).status],
    [15_000, "priced"]
  );
  assert.equal(quoteShipping({ subtotalKurus: 300_000 }, settings).status, "free");
  const unset = quoteShipping({ subtotalKurus: 10_000 }, { feeKurus: null, freeThresholdKurus: 300_000 });
  assert.deepEqual([unset.status, unset.feeKurus, shippingModeOf(unset)], ["recipient", 0, "recipient"]);
  // Ücretsiz kargo, ücret girilmemiş olsa da ücretsiz
  assert.equal(quoteShipping({ subtotalKurus: 400_000 }, { feeKurus: null, freeThresholdKurus: 300_000 }).status, "free");
});

test("eski biçim (desi tarifesi, koliler): ücret girilmemiş sayılır, sınır korunur; bozuk değer varsayılana döner", () => {
  const legacy = JSON.stringify({ freeThresholdKurus: 250_000, tariff: { bands: [{ maxDesi: 3, priceKurus: 9_000 }] }, boxes: [], packaging: {} });
  assert.deepEqual(parseShippingSettings(legacy), { feeKurus: null, freeThresholdKurus: 250_000 });
  assert.deepEqual(parseShippingSettings("{bozuk"), { feeKurus: null, freeThresholdKurus: 300_000 });
  assert.deepEqual(parseShippingSettings(JSON.stringify({ feeKurus: 12_500, freeThresholdKurus: 0 })), { feeKurus: 12_500, freeThresholdKurus: 0 });
});

test("kaydetme: yeni alanlar yazılır, eski tarife verisi silinmez", async () => {
  const legacy = { freeThresholdKurus: 250_000, tariff: { bands: [{ maxDesi: 3, priceKurus: 9_000 }], extraPerDesiKurus: null }, boxes: [] };
  await prisma.siteSetting.create({ data: { key: SHIPPING_SETTING_KEY, value: JSON.stringify(legacy) } });
  const saved = await saveShippingSettings({ feeKurus: 15_000, freeThresholdKurus: 300_000 });
  assert.deepEqual(saved, { feeKurus: 15_000, freeThresholdKurus: 300_000 });
  const raw = JSON.parse((await prisma.siteSetting.findUniqueOrThrow({ where: { key: SHIPPING_SETTING_KEY } })).value);
  assert.deepEqual(raw.tariff, legacy.tariff);
  assert.deepEqual(await getShippingSettings(), { feeKurus: 15_000, freeThresholdKurus: 300_000 });
});

test("sipariş: sabit kargo ücreti toplama eklenir; sınırın üstünde ücretsiz; sepet ücreti aynı", async () => {
  await enableBankTransfer();
  await saveShippingSettings({ feeKurus: 15_000, freeThresholdKurus: 300_000 });
  const { variant } = await createProduct({ priceKurus: 50_000, stock: 20 });

  const quote = await quoteRoute(jsonRequest("http://localhost/api/shipping/quote", { items: [{ variantId: variant.id, quantity: 1 }] }));
  assert.deepEqual((await quote.json()).quote, { status: "priced", carrierName: "Yurtiçi Kargo", feeKurus: 15_000 });

  const place = async (quantity: number) => {
    const res = await checkout(
      jsonRequest("http://localhost/api/checkout", checkoutBody([{ variantId: variant.id, quantity }], { paymentMethod: "BANK_TRANSFER" }))
    );
    assert.equal(res.status, 200);
    const { orderId } = await res.json();
    return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  };

  const small = await place(1);
  assert.deepEqual([small.subtotalKurus, small.shippingKurus, small.totalKurus], [50_000, 15_000, 65_000]);
  assert.equal((small.shippingAddress as { shippingMode?: string }).shippingMode, "prepaid");

  const big = await place(6); // 3.000 TL: sınırda ücretsiz
  assert.deepEqual([big.subtotalKurus, big.shippingKurus, big.totalKurus], [300_000, 0, 300_000]);
  assert.equal((big.shippingAddress as { shippingMode?: string }).shippingMode, "free");
});
