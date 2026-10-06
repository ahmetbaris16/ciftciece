/**
 * İndirim (kampanya) kayıtları: etkin indirimleri okuma, başlatma, bitirme; varyant fiyat geçmişi.
 *
 * - Bir üründe aynı anda tek etkin indirim; yenisi başlarken eskisi bitirilir (ürün satırı kilitli, aynı işlemde).
 * - İndirimden önceki fiyat ve indirimli fiyat indirim başlarken hesaplanıp kaydedilir (lib/pricing/discount.ts):
 *   vitrin, sepet ve ödeme bu kayıtları okur; tutar hep sunucuda hesaplanır.
 * - Kayıtlar silinmez: bitirilen indirim sonraki indirimin "son 10 günün en düşük fiyatı" hesabında kullanılır.
 * - Veritabanı güncellenmeden (migration uygulanmadan / Prisma istemcisi yenilenmeden) çalışan sunucuda indirim
 *   özelliği kapalı sayılır (vitrin indirimsiz çalışmaya devam eder); diğer hatalar çağırana iletilir.
 * DATABASE_URL yoksa (yalnız development) indirim yoktur.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";
import {
  MAX_DISCOUNT_DAYS,
  MAX_PERCENT,
  MIN_PERCENT,
  REFERENCE_WINDOW_MS,
  discountEnd,
  effectivePrice,
  lowestPriceInWindow,
  salePrice,
} from "@/lib/pricing/discount";
import type { Product } from "@/types";
import { AdminActionError } from "@/lib/admin/errors";

type Tx = Prisma.TransactionClient;

export interface ActiveDiscount {
  id: string;
  percent: number;
  startsAt: Date;
  endsAt: Date;
  /** varyant id → indirimden önceki fiyat ve indirimli fiyat (kuruş) */
  items: Map<string, { referenceKurus: number; saleKurus: number }>;
}

let warnedUnavailable = false;

/** Eski Prisma istemcisi (generate edilmemiş) ya da tablo yok (migration uygulanmamış): indirim kapalı sayılır */
function discountsUnavailable(err?: unknown): boolean {
  const delegate = (prisma as unknown as { productDiscount?: { findMany?: unknown } }).productDiscount;
  const unavailable = typeof delegate?.findMany !== "function" || (err as { code?: string } | undefined)?.code === "P2021";
  if (unavailable && !warnedUnavailable) {
    warnedUnavailable = true;
    console.warn("[indirim] İndirim tabloları bu sunucuda yok (migration/prisma generate bekliyor): indirimsiz devam ediliyor.");
  }
  return unavailable;
}

export function activeDiscountWhere(now: Date): Prisma.ProductDiscountWhereInput {
  return {
    startsAt: { lte: now },
    endsAt: { gt: now },
    OR: [{ endedAt: null }, { endedAt: { gt: now } }],
  };
}

/** Ürün id → etkin indirim (vitrin: ürün listeleri ve ürün sayfası) */
export async function getActiveDiscountsByProduct(productIds: string[], now = new Date()): Promise<Map<string, ActiveDiscount>> {
  const result = new Map<string, ActiveDiscount>();
  if (!USE_DB || productIds.length === 0 || discountsUnavailable()) return result;
  try {
    const rows = await prisma.productDiscount.findMany({
      where: { productId: { in: productIds }, ...activeDiscountWhere(now) },
      include: { items: { select: { variantId: true, referenceKurus: true, saleKurus: true } } },
      orderBy: { startsAt: "desc" },
    });
    for (const d of rows) {
      if (result.has(d.productId)) continue; // aynı anda iki etkin kayıt olmamalı; olursa en yenisi
      result.set(d.productId, {
        id: d.id,
        percent: d.percent,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        items: new Map(d.items.map((i) => [i.variantId, { referenceKurus: i.referenceKurus, saleKurus: i.saleKurus }])),
      });
    }
    return result;
  } catch (err) {
    if (discountsUnavailable(err)) return result;
    throw err;
  }
}

/** Ürüne süren indirimi uygular: indirimli varyantın fiyatı indirimli fiyat, eski fiyat compareAtPriceKurus */
export function applyProductDiscount(p: Product, d: ActiveDiscount | undefined): Product {
  if (!d) return p;
  let discounted = false;
  const variants = p.variants.map((v) => {
    const e = effectivePrice(v.priceKurus, d.items.get(v.id));
    if (e.compareAtKurus === null) return v;
    discounted = true;
    return { ...v, priceKurus: e.priceKurus, compareAtPriceKurus: e.compareAtKurus };
  });
  if (!discounted) return p;
  return { ...p, variants, discount: { percent: d.percent, startsAt: d.startsAt.toISOString(), endsAt: d.endsAt.toISOString() } };
}

/**
 * Vitrin: ürün listelerine süren indirimleri uygular. İndirimler okunamazsa ürünler indirimsiz döner (sayfa açılır,
 * hata loglanır); sepet ve ödeme fiyatı yine sunucuda ayrıca hesaplanır.
 */
export async function withActiveDiscounts(products: Product[], now = new Date()): Promise<Product[]> {
  let active: Map<string, ActiveDiscount>;
  try {
    active = await getActiveDiscountsByProduct(
      products.map((p) => p.id),
      now
    );
  } catch (err) {
    console.error("[indirim] Vitrin indirimleri okunamadı:", err);
    return products;
  }
  return active.size === 0 ? products : products.map((p) => applyProductDiscount(p, active.get(p.id)));
}

/** Varyant id → etkin indirim kalemi (sepet ve ödeme) */
export async function getActiveDiscountItems(
  variantIds: string[],
  now = new Date()
): Promise<Map<string, { referenceKurus: number; saleKurus: number; percent: number; startsAt: Date; endsAt: Date }>> {
  const result = new Map<string, { referenceKurus: number; saleKurus: number; percent: number; startsAt: Date; endsAt: Date }>();
  if (!USE_DB || variantIds.length === 0 || discountsUnavailable()) return result;
  try {
    const rows = await prisma.productDiscountItem.findMany({
      where: { variantId: { in: variantIds }, discount: activeDiscountWhere(now) },
      include: { discount: { select: { percent: true, startsAt: true, endsAt: true } } },
      orderBy: { discount: { startsAt: "desc" } },
    });
    for (const r of rows) {
      if (result.has(r.variantId)) continue;
      result.set(r.variantId, {
        referenceKurus: r.referenceKurus,
        saleKurus: r.saleKurus,
        percent: r.discount.percent,
        startsAt: r.discount.startsAt,
        endsAt: r.discount.endsAt,
      });
    }
    return result;
  } catch (err) {
    if (discountsUnavailable(err)) return result;
    throw err;
  }
}

// ── Fiyat geçmişi ─────────────────────────────────────────────

/**
 * Liste fiyatı değişikliğini kaydeder (çağıranın işleminde). Varyantın hiç kaydı yoksa önce eski fiyat, ürünün
 * eklendiği tarihle yazılır: o tarihten beri bu fiyattan satıldığı varsayılır (kayıt tutulmadan önceki geçmiş bilinmez).
 */
export async function recordPriceChange(
  tx: Tx,
  input: { variantId: string; oldPriceKurus: number; newPriceKurus: number; since: Date },
  now = new Date()
): Promise<void> {
  if (input.oldPriceKurus === input.newPriceKurus || discountsUnavailable()) return;
  const hasHistory = (await tx.variantPriceLog.count({ where: { variantId: input.variantId } })) > 0;
  if (!hasHistory) {
    await tx.variantPriceLog.create({ data: { variantId: input.variantId, priceKurus: input.oldPriceKurus, createdAt: input.since } });
  }
  await tx.variantPriceLog.create({ data: { variantId: input.variantId, priceKurus: input.newPriceKurus, createdAt: now } });
}

/** Yeni varyantın ilk fiyatı */
export async function recordInitialPrice(tx: Tx, variantId: string, priceKurus: number, now = new Date()): Promise<void> {
  if (discountsUnavailable()) return;
  await tx.variantPriceLog.create({ data: { variantId, priceKurus, createdAt: now } });
}

/**
 * Varyant id → şu anki "indirimden önceki fiyat": son 10 günde uygulanan en düşük satış fiyatı (o sırada süren
 * indirim dahil). Yönetici formundaki önizleme ve indirim başlatma aynı hesabı kullanır.
 */
export async function referencePrices(
  db: Tx | typeof prisma,
  variants: Array<{ id: string; priceKurus: number }>,
  now = new Date()
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (variants.length === 0) return result;
  const ids = variants.map((v) => v.id);
  const from = new Date(now.getTime() - REFERENCE_WINDOW_MS);
  const [logs, pastItems] = await Promise.all([
    db.variantPriceLog.findMany({
      where: { variantId: { in: ids }, createdAt: { lte: now } },
      orderBy: { createdAt: "asc" },
      select: { variantId: true, priceKurus: true, createdAt: true },
    }),
    // Pencereyle kesişen indirimler (bitmiş ya da süren)
    db.productDiscountItem.findMany({
      where: { variantId: { in: ids }, discount: { startsAt: { lt: now }, endsAt: { gt: from } } },
      select: { variantId: true, saleKurus: true, discount: { select: { startsAt: true, endsAt: true, endedAt: true } } },
    }),
  ]);
  for (const v of variants) {
    result.set(
      v.id,
      lowestPriceInWindow({
        currentRegularKurus: v.priceKurus,
        changes: logs.filter((l) => l.variantId === v.id).map((l) => ({ priceKurus: l.priceKurus, at: l.createdAt })),
        sales: pastItems
          .filter((i) => i.variantId === v.id)
          .map((i) => ({ saleKurus: i.saleKurus, from: i.discount.startsAt, to: discountEnd(i.discount) }))
          .filter((s) => s.to > from),
        from,
        to: now,
      })
    );
  }
  return result;
}

// ── Yönetici ──────────────────────────────────────────────────

export interface StartDiscountResult {
  started: Array<{ productId: string; name: string; variants: number }>;
  skipped: Array<{ productId: string; name: string; reason: string }>;
}

/**
 * Seçilen ürünlere indirim başlatır (hemen; bitiş zorunlu). Her ürün kendi işleminde: ürün satırı kilitlenir, süren
 * indirim bitirilir, eski fiyat (son 10 günün en düşüğü) ve indirimli fiyat varyant başına yazılır. Fiyatı girilmemiş
 * ya da satışta olmayan varyant indirime girmez; hiçbir varyantı uygun olmayan ürün atlanır (sebebiyle döner).
 */
export async function startDiscounts(
  input: { productIds: string[]; percent: number; endsAt: Date; adminId: string },
  now = new Date()
): Promise<StartDiscountResult> {
  if (!USE_DB || discountsUnavailable()) throw new AdminActionError("İndirim için veritabanı güncellemesi gerekiyor.", 503);
  const { percent, endsAt } = input;
  if (!Number.isInteger(percent) || percent < MIN_PERCENT || percent > MAX_PERCENT) {
    throw new AdminActionError(`İndirim oranı %${MIN_PERCENT} ile %${MAX_PERCENT} arasında bir tam sayı olmalı.`);
  }
  if (endsAt.getTime() <= now.getTime()) throw new AdminActionError("Bitiş tarihi bugünden sonra olmalı.");
  if (endsAt.getTime() - now.getTime() > MAX_DISCOUNT_DAYS * 24 * 60 * 60 * 1000) {
    throw new AdminActionError(`İndirim en çok ${MAX_DISCOUNT_DAYS} gün sürebilir.`);
  }
  const productIds = [...new Set(input.productIds)];
  if (productIds.length === 0) throw new AdminActionError("İndirim yapılacak ürünü seçin.");

  const result: StartDiscountResult = { started: [], skipped: [] };
  for (const productId of productIds) {
    await prisma.$transaction(async (tx) => {
      // Aynı ürüne aynı anda iki indirim başlatılmasın
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true, name: true, variants: { select: { id: true, priceKurus: true, isAvailable: true } } },
      });
      if (!product) {
        result.skipped.push({ productId, name: "—", reason: "Ürün bulunamadı." });
        return;
      }
      // Süren indirim bu anda biter (fiyatı yine son 10 günün hesabına girer)
      await tx.productDiscount.updateMany({
        where: { productId, ...activeDiscountWhere(now) },
        data: { endedAt: now, endedById: input.adminId },
      });
      const sellable = product.variants.filter((v) => v.isAvailable && v.priceKurus > 0);
      const refs = await referencePrices(tx, sellable, now);
      const items = sellable
        .map((v) => {
          const referenceKurus = refs.get(v.id) ?? v.priceKurus;
          return { variantId: v.id, referenceKurus, saleKurus: salePrice(referenceKurus, percent) };
        })
        .filter((i) => i.referenceKurus > 0 && i.saleKurus < i.referenceKurus);
      if (items.length === 0) {
        result.skipped.push({ productId, name: product.name, reason: "Satışta, fiyatı girilmiş seçeneği yok." });
        return;
      }
      await tx.productDiscount.create({
        data: { productId, percent, startsAt: now, endsAt, createdById: input.adminId, items: { create: items } },
      });
      result.started.push({ productId, name: product.name, variants: items.length });
    });
  }
  return result;
}

/** İndirimi şimdi bitirir. Etkin değilse (zaten bitmiş) null. */
export async function endDiscount(id: string, adminId: string, now = new Date()): Promise<{ productId: string } | null> {
  if (!USE_DB || discountsUnavailable()) return null;
  const d = await prisma.productDiscount.findUnique({ where: { id }, select: { productId: true } });
  if (!d) return null;
  const { count } = await prisma.productDiscount.updateMany({
    where: { id, ...activeDiscountWhere(now) },
    data: { endedAt: now, endedById: adminId },
  });
  return count === 1 ? { productId: d.productId } : null;
}

export interface AdminDiscountRow {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  percent: number;
  startsAt: Date;
  endsAt: Date;
  /** Fiilen bittiği an (bitmişse) */
  endedAt: Date | null;
  active: boolean;
  items: Array<{ variantName: string; referenceKurus: number; saleKurus: number }>;
}

/** Panel: süren indirimler ve son biten 20 indirim */
export async function listDiscountsForAdmin(now = new Date()): Promise<{ active: AdminDiscountRow[]; past: AdminDiscountRow[] }> {
  if (!USE_DB || discountsUnavailable()) return { active: [], past: [] };
  const include = {
    product: { select: { name: true, slug: true } },
    items: { select: { referenceKurus: true, saleKurus: true, variant: { select: { name: true, sortOrder: true } } } },
  } as const;
  const [active, past] = await Promise.all([
    prisma.productDiscount.findMany({ where: activeDiscountWhere(now), include, orderBy: { endsAt: "asc" } }),
    prisma.productDiscount.findMany({
      where: { OR: [{ endsAt: { lte: now } }, { endedAt: { lte: now } }] },
      include,
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const map = (d: (typeof active)[number], isActive: boolean): AdminDiscountRow => ({
    id: d.id,
    productId: d.productId,
    productName: d.product.name,
    productSlug: d.product.slug,
    percent: d.percent,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    endedAt: isActive ? null : discountEnd(d),
    active: isActive,
    items: d.items
      .slice()
      .sort((a, b) => a.variant.sortOrder - b.variant.sortOrder)
      .map((i) => ({ variantName: i.variant.name, referenceKurus: i.referenceKurus, saleKurus: i.saleKurus })),
  });
  return { active: active.map((d) => map(d, true)), past: past.map((d) => map(d, false)) };
}

/** Yakın zamanda (son `withinMs` içinde) kendiliğinden ya da elle bitmiş indirim var mı (vitrin önbelleği tazelemek için) */
export async function discountsEndedRecently(withinMs: number, now = new Date()): Promise<number> {
  if (!USE_DB || discountsUnavailable()) return 0;
  const since = new Date(now.getTime() - withinMs);
  return prisma.productDiscount.count({
    where: { OR: [{ endsAt: { gt: since, lte: now } }, { endedAt: { gt: since, lte: now } }] },
  });
}
