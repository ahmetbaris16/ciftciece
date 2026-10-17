/**
 * Kargo: sabit ücret + ücretsiz kargo sınırı. Ücret kayıtta boşsa 400 TL varsayılanı kullanılır (alıcı ödemeli yok). Eski
 * sürümün desi tarifesi/koli ayarları okunmaz ama kaydederken silinmez. Sipariş tutarı sunucudaki ayardan hesaplanır.
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

test("hesap: sınırın altında sabit ücret, sınırda ve üstünde ücretsiz; alıcı ödemeli durumu üretilmez", () => {
  const settings = { feeKurus: 15_000, freeThresholdKurus: 300_000 };
  assert.deepEqual(
    [quoteShipping({ subtotalKurus: 10_000 }, settings).feeKurus, quoteShipping({ subtotalKurus: 299_999 }, settings).status],
    [15_000, "priced"]
  );
  assert.equal(quoteShipping({ subtotalKurus: 300_000 }, settings).status, "free");
  const low = quoteShipping({ subtotalKurus: 10_000 }, settings);
  assert.deepEqual([low.status, shippingModeOf(low)], ["priced", "prepaid"]);
  assert.equal(shippingModeOf(quoteShipping({ subtotalKurus: 400_000 }, settings)), "free");
});

test("eski biçim (desi tarifesi) ve boş ücretli kayıt: ücret 400 TL varsayılanıyla tamamlanır, sınır korunur; bozuk değer varsayılana döner", () => {
  const legacy = JSON.stringify({ freeThresholdKurus: 250_000, tariff: { bands: [{ maxDesi: 3, priceKurus: 9_000 }] }, boxes: [], packaging: {} });
  assert.deepEqual(parseShippingSettings(legacy), { feeKurus: 40_000, freeThresholdKurus: 250_000 });
  assert.deepEqual(parseShippingSettings(JSON.stringify({ feeKurus: null, freeThresholdKurus: 300_000 })), { feeKurus: 40_000, freeThresholdKurus: 300_000 });
  assert.deepEqual(parseShippingSettings("{bozuk"), { feeKurus: 40_000, freeThresholdKurus: 300_000 });
  assert.deepEqual(parseShippingSettings(JSON.stringify({ feeKurus: 12_500, freeThresholdKurus: 0 })), { feeKurus: 12_500, freeThresholdKurus: 0 });
  // Yönetici ücreti 0 yaparsa (her sipariş ücretsiz kargo) bu geçerli bir seçimdir, varsayılana dönmez
  assert.equal(parseShippingSettings(JSON.stringify({ feeKurus: 0, freeThresholdKurus: 300_000 })).feeKurus, 0);
});

test("DB'de ücreti boş eski kayıt varsa sepet 400 TL gösterir, kayıt silinmez; yönetici değiştirince yeni ücret geçerli olur", async () => {
  const stored = JSON.stringify({ feeKurus: null, freeThresholdKurus: 300_000, tariff: { bands: [] } });
  await prisma.siteSetting.create({ data: { key: SHIPPING_SETTING_KEY, value: stored } });
  const { variant } = await createProduct({ priceKurus: 50_000, stock: 20 });
  const ask = async () =>
    (await (await quoteRoute(jsonRequest("http://localhost/api/shipping/quote", { items: [{ variantId: variant.id, quantity: 1 }] }))).json()).quote;

  assert.deepEqual(await ask(), { status: "priced", carrierName: "Yurtiçi Kargo", feeKurus: 40_000 });
  assert.equal((await prisma.siteSetting.findUniqueOrThrow({ where: { key: SHIPPING_SETTING_KEY } })).value, stored, "okuma kaydı değiştirmez");

  await saveShippingSettings({ feeKurus: 25_000, freeThresholdKurus: 300_000 });
  assert.deepEqual(await ask(), { status: "priced", carrierName: "Yurtiçi Kargo", feeKurus: 25_000 });
  const raw = JSON.parse((await prisma.siteSetting.findUniqueOrThrow({ where: { key: SHIPPING_SETTING_KEY } })).value);
  assert.deepEqual(raw.tariff, { bands: [] }, "eski alanlar korunur");
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

test("ayar kaydı yokken varsayılan: 400 TL sabit kargo, 3.000 TL ve üzeri ücretsiz (2026-10-18)", async () => {
  assert.deepEqual(parseShippingSettings(null), { feeKurus: 40_000, freeThresholdKurus: 300_000 });
  assert.equal(await prisma.siteSetting.count({ where: { key: SHIPPING_SETTING_KEY } }), 0);
  await enableBankTransfer();
  const { variant } = await createProduct({ priceKurus: 50_000, stock: 20 });

  const quote = await quoteRoute(jsonRequest("http://localhost/api/shipping/quote", { items: [{ variantId: variant.id, quantity: 1 }] }));
  assert.deepEqual((await quote.json()).quote, { status: "priced", carrierName: "Yurtiçi Kargo", feeKurus: 40_000 });

  const place = async (quantity: number) => {
    const res = await checkout(
      jsonRequest("http://localhost/api/checkout", checkoutBody([{ variantId: variant.id, quantity }], { paymentMethod: "BANK_TRANSFER" }))
    );
    assert.equal(res.status, 200);
    const { orderId } = await res.json();
    return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  };
  const small = await place(5); // 2.500 TL: 400 TL kargo
  assert.deepEqual([small.subtotalKurus, small.shippingKurus, small.totalKurus], [250_000, 40_000, 290_000]);
  assert.equal((small.shippingAddress as { shippingMode?: string }).shippingMode, "prepaid");
  const big = await place(6); // 3.000 TL: ücretsiz
  assert.deepEqual([big.shippingKurus, big.totalKurus], [0, 300_000]);
});
