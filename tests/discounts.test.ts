/**
 * İndirim (kampanya):
 * - Hesaplar: indirimli fiyat, "son 10 günün en düşük fiyatı" (fiyat artışı ve önceki indirim dahil), tarih yardımcıları.
 * - Başlatınca vitrin (ürün sayfası, listeler), sepet eşitleme ve ödeme indirimli fiyatı kullanır; sipariş kalemine
 *   indirimden önceki fiyat + kalem indirimi yazılır. Bitirince eski fiyata döner.
 * - Bir üründe tek etkin indirim; yönetici sınırları; fiyat değişikliği geçmişe yazılır.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { POST as checkout } from "@/app/api/checkout/route";
import { getProductBySlug, getCartVariants } from "@/lib/repositories";
import {
  discountsEndedRecently,
  endDiscount,
  startDiscounts,
} from "@/lib/repositories/discount.repository";
import { updateVariantAndStock } from "@/lib/repositories/inventory.repository";
import {
  cartSavingsKurus,
  discountPercentLabel,
  effectivePrice,
  formatDiscountPeriod,
  isDiscountActive,
  istanbulEndOfDay,
  lowestPriceInWindow,
  salePrice,
} from "@/lib/pricing/discount";
import { AdminActionError } from "@/lib/admin/errors";
import { createProduct, enableBankTransfer, setupTestDb } from "./helpers/db";
import { checkoutBody, jsonRequest } from "./helpers/http";

setupTestDb();

const DAY = 24 * 60 * 60 * 1000;
const days = (n: number, from = Date.now()) => new Date(from + n * DAY);

test("hesaplar: indirimli fiyat, son 10 günün en düşüğü, etkinlik, tarih ve sepet indirimi", () => {
  assert.equal(salePrice(35_000, 15), 29_750);
  assert.equal(salePrice(34_990, 15), 29_742); // 29741,5 → kuruşa yuvarlanır
  assert.equal(salePrice(1, 1), 1);

  const now = new Date("2026-10-06T12:00:00Z");
  const from = new Date(now.getTime() - 10 * DAY);
  // Kayıt yok: bugünkü fiyat
  assert.equal(lowestPriceInWindow({ currentRegularKurus: 40_000, changes: [], sales: [], from, to: now }), 40_000);
  // 3 gün önce 30.000'den 40.000'e çıkarıldı: eski fiyat 30.000
  const raised = [
    { priceKurus: 30_000, at: days(-20, now.getTime()) },
    { priceKurus: 40_000, at: days(-3, now.getTime()) },
  ];
  assert.equal(lowestPriceInWindow({ currentRegularKurus: 40_000, changes: raised, sales: [], from, to: now }), 30_000);
  // 12 gün önce 30.000'den 40.000'e çıkarıldı (pencerenin dışında): 40.000
  const old = [
    { priceKurus: 30_000, at: days(-20, now.getTime()) },
    { priceKurus: 40_000, at: days(-12, now.getTime()) },
  ];
  assert.equal(lowestPriceInWindow({ currentRegularKurus: 40_000, changes: old, sales: [], from, to: now }), 40_000);
  // Pencerede biten önceki indirim (36.000) en düşük; pencereden önce biten indirim sayılmaz
  const sales = [
    { saleKurus: 36_000, from: days(-6, now.getTime()), to: days(-4, now.getTime()) },
    { saleKurus: 20_000, from: days(-30, now.getTime()), to: days(-15, now.getTime()) },
  ];
  assert.equal(lowestPriceInWindow({ currentRegularKurus: 40_000, changes: [], sales, from, to: now }), 36_000);

  const d = { startsAt: days(-1, now.getTime()), endsAt: days(2, now.getTime()), endedAt: null };
  assert.equal(isDiscountActive(d, now), true);
  assert.equal(isDiscountActive({ ...d, endedAt: days(-0.5, now.getTime()) }, now), false);
  assert.equal(isDiscountActive(d, days(3, now.getTime())), false);

  assert.equal(istanbulEndOfDay("2026-10-13")?.toISOString(), "2026-10-13T20:59:59.999Z");
  assert.equal(istanbulEndOfDay("13.10.2026"), null);
  assert.equal(formatDiscountPeriod("2026-10-06T09:00:00Z", "2026-10-13T20:59:59.999Z"), "6–13 Ekim 2026");
  assert.equal(formatDiscountPeriod("2026-10-28T09:00:00Z", "2026-11-03T20:59:59.999Z"), "28 Ekim – 3 Kasım 2026");

  assert.deepEqual(effectivePrice(35_000, { referenceKurus: 35_000, saleKurus: 29_750 }), { priceKurus: 29_750, compareAtKurus: 35_000 });
  // Liste fiyatı indirimli fiyatın altına indirildiyse indirim gösterilmez
  assert.deepEqual(effectivePrice(28_000, { referenceKurus: 35_000, saleKurus: 29_750 }), { priceKurus: 28_000, compareAtKurus: null });
  assert.equal(discountPercentLabel(35_000, 29_750), 15);
  assert.equal(
    cartSavingsKurus([
      { priceKurus: 29_750, compareAtPriceKurus: 35_000, quantity: 2 },
      { priceKurus: 10_000, quantity: 1 },
    ]),
    10_500
  );
});

test("indirim başlar: vitrin, sepet ve ödeme indirimli fiyatı kullanır; kaleme eski fiyat + kalem indirimi; bitince eski fiyat", async () => {
  await enableBankTransfer();
  const { product, variant } = await createProduct({ priceKurus: 35_000, stock: 10 });

  const r = await startDiscounts({ productIds: [product.id], percent: 15, endsAt: days(7), adminId: "admin-1" });
  assert.deepEqual(r.started.map((s) => s.productId), [product.id]);

  const shown = await getProductBySlug(product.slug);
  assert.equal(shown?.variants[0].priceKurus, 29_750);
  assert.equal(shown?.variants[0].compareAtPriceKurus, 35_000);
  assert.equal(shown?.discount?.percent, 15);

  const cart = await getCartVariants([variant.id]);
  assert.equal(cart.get(variant.id)?.priceKurus, 29_750);
  assert.equal(cart.get(variant.id)?.compareAtPriceKurus, 35_000);

  // İstemcinin gönderdiği fiyat yok: tutar sunucudaki indirim kaydından
  const res = await checkout(
    jsonRequest("http://localhost/api/checkout", checkoutBody([{ variantId: variant.id, quantity: 2 }], { paymentMethod: "BANK_TRANSFER" }))
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  const order = await prisma.order.findUniqueOrThrow({ where: { id: body.orderId }, include: { items: true } });
  assert.equal(order.items[0].snapshotPrice, 35_000);
  assert.equal(order.items[0].discountKurus, 10_500);
  assert.equal(order.subtotalKurus, 59_500);
  assert.equal(order.totalKurus, 59_500 + order.shippingKurus + order.paymentFeeKurus);

  const active = await prisma.productDiscount.findFirstOrThrow({ where: { productId: product.id } });
  assert.ok(await endDiscount(active.id, "admin-1"));
  assert.equal(await endDiscount(active.id, "admin-1"), null); // ikinci kez bitmez
  const after = await getProductBySlug(product.slug);
  assert.equal(after?.variants[0].priceKurus, 35_000);
  assert.equal(after?.variants[0].compareAtPriceKurus ?? null, null);
  assert.equal(after?.discount ?? null, null);
  assert.ok((await discountsEndedRecently(15 * 60_000)) >= 1);
});

test("eski fiyat son 10 günün en düşüğü: yakında artırılan fiyatta eski fiyat, önceki indirimde onun fiyatı esas", async () => {
  // A: 3 gün önce 30.000 → 40.000 yapıldı; %10 indirimde eski fiyat 30.000 (40.000 değil)
  const a = await createProduct({ priceKurus: 40_000, stock: 5 });
  await prisma.variantPriceLog.createMany({
    data: [
      { variantId: a.variant.id, priceKurus: 30_000, createdAt: days(-20) },
      { variantId: a.variant.id, priceKurus: 40_000, createdAt: days(-3) },
    ],
  });
  await startDiscounts({ productIds: [a.product.id], percent: 10, endsAt: days(5), adminId: "admin-1" });
  const shownA = await getProductBySlug(a.product.slug);
  assert.equal(shownA?.variants[0].compareAtPriceKurus, 30_000);
  assert.equal(shownA?.variants[0].priceKurus, 27_000);

  // B: 6 gün önce %20 indirim (40.000), 4 gün önce bitti; bugün %10 → eski fiyat 40.000, yeni 36.000
  const b = await createProduct({ priceKurus: 50_000, stock: 5 });
  await startDiscounts({ productIds: [b.product.id], percent: 20, endsAt: days(10, days(-6).getTime()), adminId: "admin-1" }, days(-6));
  const first = await prisma.productDiscount.findFirstOrThrow({ where: { productId: b.product.id } });
  assert.ok(await endDiscount(first.id, "admin-1", days(-4)));
  await startDiscounts({ productIds: [b.product.id], percent: 10, endsAt: days(5), adminId: "admin-1" });
  const shownB = await getProductBySlug(b.product.slug);
  assert.equal(shownB?.variants[0].compareAtPriceKurus, 40_000);
  assert.equal(shownB?.variants[0].priceKurus, 36_000);
});

test("tek etkin indirim (yenisi eskisini bitirir); sınırlar; fiyatı olmayan ürün atlanır; fiyat değişikliği geçmişe yazılır", async () => {
  const { product, variant } = await createProduct({ priceKurus: 35_000, stock: 5 });
  await startDiscounts({ productIds: [product.id], percent: 10, endsAt: days(5), adminId: "admin-1" });
  await startDiscounts({ productIds: [product.id], percent: 20, endsAt: days(5), adminId: "admin-1" });
  const all = await prisma.productDiscount.findMany({ where: { productId: product.id }, orderBy: { createdAt: "asc" } });
  assert.equal(all.length, 2);
  assert.ok(all[0].endedAt, "ilk indirim bitirildi");
  assert.equal(all[1].endedAt, null);
  // İkinci indirimin eski fiyatı, az önce uygulanan ilk indirim fiyatı (31.500): 31.500 × 0,8 = 25.200
  const shown = await getProductBySlug(product.slug);
  assert.equal(shown?.variants[0].compareAtPriceKurus, 31_500);
  assert.equal(shown?.variants[0].priceKurus, 25_200);

  await assert.rejects(startDiscounts({ productIds: [product.id], percent: 0, endsAt: days(5), adminId: "a" }), AdminActionError);
  await assert.rejects(startDiscounts({ productIds: [product.id], percent: 91, endsAt: days(5), adminId: "a" }), AdminActionError);
  await assert.rejects(startDiscounts({ productIds: [product.id], percent: 10, endsAt: days(-1), adminId: "a" }), AdminActionError);
  await assert.rejects(startDiscounts({ productIds: [product.id], percent: 10, endsAt: days(61), adminId: "a" }), AdminActionError);
  await assert.rejects(startDiscounts({ productIds: [], percent: 10, endsAt: days(5), adminId: "a" }), AdminActionError);

  const free = await createProduct({ priceKurus: 0, stock: 5 });
  const r = await startDiscounts({ productIds: [free.product.id], percent: 10, endsAt: days(5), adminId: "admin-1" });
  assert.equal(r.started.length, 0);
  assert.equal(r.skipped[0].productId, free.product.id);

  // Liste fiyatı değişince: kaydı yoksa önce eski fiyat (ürünün eklendiği tarihle), sonra yeni fiyat
  await updateVariantAndStock(product.id, variant.id, { priceKurus: 45_000 });
  await updateVariantAndStock(product.id, variant.id, { priceKurus: 47_500 });
  await updateVariantAndStock(product.id, variant.id, { name: "1 kg kavanoz" }); // fiyat değişmedi: kayıt yok
  const logs = await prisma.variantPriceLog.findMany({ where: { variantId: variant.id }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(logs.map((l) => l.priceKurus), [35_000, 45_000, 47_500]);
  assert.equal(logs[0].createdAt.getTime(), product.createdAt.getTime());
});
