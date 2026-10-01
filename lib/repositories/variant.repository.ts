/**
 * Variant Repository
 *
 * Fiyat ve stok doğrulaması için kritik.
 * Cart API ve Checkout API buradan beslenir.
 *
 * DATABASE_URL yoksa (sadece development) mock veri — bkz. lib/data/source.ts.
 */

import { prisma } from "@/lib/db/prisma";
import { USE_DB, loadMock as getMock } from "@/lib/data/source";
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

  const product: Product = {
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

  const mappedVariant: ProductVariant = {
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
