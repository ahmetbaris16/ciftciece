/**
 * Variant Repository
 *
 * Fiyat ve stok doğrulaması için kritik.
 * Cart API ve Checkout API buradan beslenir.
 *
 * Süren indirim uygulanır: indirimli varyantta priceKurus indirimli fiyat, compareAtPriceKurus indirimden önceki
 * fiyattır (sepet ve ödeme bu fiyatı kullanır). İndirimler okunamazsa hata çağırana gider (ödeme farklı fiyatla
 * alınmasın); yalnız veritabanı güncellenmemişse indirimsiz devam edilir.
 * DATABASE_URL yoksa (sadece development) mock veri — bkz. lib/data/source.ts.
 */

import { prisma } from "@/lib/db/prisma";
import { USE_DB, loadMock as getMock } from "@/lib/data/source";
import type { CartVariantSnapshot } from "@/lib/cart/sync";
import { effectivePrice } from "@/lib/pricing/discount";
import { applyProductDiscount, getActiveDiscountItems, getActiveDiscountsByProduct } from "./discount.repository";
import type { Product, ProductVariant } from "@/types";

export interface VariantLookupResult {
  product: Product;
  variant: ProductVariant;
}

/**
 * variantId ile ürün + varyant bilgisi döner.
 * Stok doğrulama, fiyat kontrolü için kullanılır.
 */
export async function getVariantById(variantId: string): Promise<VariantLookupResult | null> {
  if (!USE_DB) {
    const mock = await getMock();
    return mock.getVariantById(variantId) ?? null;
  }

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: {
      inventory: true,
      product: {
        include: {
          category: true,
          images: { orderBy: { sortOrder: "asc" } },
          variants: {
            orderBy: { sortOrder: "asc" },
            include: { inventory: true },
          },
        },
      },
    },
  });

  if (!variant) return null;

  const p = variant.product;

  const listed: Product = {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    categoryId: p.categoryId,
    category: {
      id: p.category.id,
      name: p.category.name,
      slug: p.category.slug,
      description: p.category.description,
      imageUrl: p.category.imageUrl,
      sortOrder: p.category.sortOrder,
      isPublished: p.category.isPublished,
    },
    images: p.images.map((img) => ({
      id: img.id,
      url: img.url,
      altText: img.altText,
      sortOrder: img.sortOrder,
    })),
    variants: p.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      priceKurus: v.priceKurus,
      isAvailable: v.isAvailable,
      sortOrder: v.sortOrder,
      stockQuantity: v.inventory?.quantity ?? 0,
    })),
    isPublished: p.isPublished,
    isFeatured: p.isFeatured,
    sortOrder: p.sortOrder,
    vatRateBps: p.vatRateBps,
  };

  const product = applyProductDiscount(listed, (await getActiveDiscountsByProduct([p.id])).get(p.id));
  const mappedVariant: ProductVariant = product.variants.find((v) => v.id === variant.id) ?? {
    id: variant.id,
    name: variant.name,
    sku: variant.sku,
    priceKurus: variant.priceKurus,
    isAvailable: variant.isAvailable,
    sortOrder: variant.sortOrder,
    stockQuantity: variant.inventory?.quantity ?? 0,
  };

  return { product, variant: mappedVariant };
}

/** Sepet eşitleme için tek sorguda hafif okuma: varyant id → güncel bilgi. Bulunamayan id haritada olmaz. */
export async function getCartVariants(variantIds: string[]): Promise<Map<string, CartVariantSnapshot>> {
  const result = new Map<string, CartVariantSnapshot>();
  if (variantIds.length === 0) return result;

  if (!USE_DB) {
    const mock = await getMock();
    for (const id of variantIds) {
      const found = mock.getVariantById(id);
      if (!found) continue;
      const image = found.product.images[0];
      result.set(id, {
        productSlug: found.product.slug,
        productName: found.product.name,
        variantName: found.variant.name,
        priceKurus: found.variant.priceKurus,
        compareAtPriceKurus: null,
        stockQuantity: found.variant.stockQuantity ?? 0,
        isAvailable: found.variant.isAvailable,
        productPublished: found.product.isPublished,
        imageUrl: image?.url ?? null,
        imageAlt: image?.altText ?? null,
      });
    }
    return result;
  }

  const rows = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: {
      id: true,
      name: true,
      priceKurus: true,
      isAvailable: true,
      inventory: { select: { quantity: true } },
      product: {
        select: {
          name: true,
          slug: true,
          isPublished: true,
          images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, altText: true } },
        },
      },
    },
  });
  const discounts = await getActiveDiscountItems(rows.map((r) => r.id));
  for (const r of rows) {
    const image = r.product.images[0];
    const price = effectivePrice(r.priceKurus, discounts.get(r.id));
    result.set(r.id, {
      productSlug: r.product.slug,
      productName: r.product.name,
      variantName: r.name,
      priceKurus: price.priceKurus,
      compareAtPriceKurus: price.compareAtKurus,
      stockQuantity: r.inventory?.quantity ?? 0,
      isAvailable: r.isAvailable,
      productPublished: r.product.isPublished,
      imageUrl: image?.url ?? null,
      imageAlt: image?.altText ?? null,
    });
  }
  return result;
}
