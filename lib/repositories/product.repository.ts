/**
 * Product Repository
 *
 * Prisma tabanlı ürün sorguları.
 * DATABASE_URL yoksa (sadece development) mock veri — bkz. lib/data/source.ts.
 * DB hataları yutulmaz; çağıran katman ele alır.
 *
 * Tüm fonksiyonlar async — sayfa/API katmanında `await` ile çağrılır.
 */

import { prisma } from "@/lib/db/prisma";
import { USE_DB, loadMock as getMock } from "@/lib/data/source";
import type { Product } from "@/types";

// ── Prisma → App Type Mapper ──────────────────────────────────

type PrismaProductFull = Awaited<ReturnType<typeof prisma.product.findFirst>> & {
  category: { id: string; name: string; slug: string; description: string | null; imageUrl: string | null; sortOrder: number; isPublished: boolean };
  images: Array<{ id: string; url: string; altText: string | null; sortOrder: number }>;
  variants: Array<{
    id: string; name: string; sku: string | null; priceKurus: number;
    isAvailable: boolean; sortOrder: number;
    inventory: { quantity: number } | null;
  }>;
};

function mapProduct(p: NonNullable<PrismaProductFull>): Product {
  return {
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
    images: p.images
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((img) => ({
        id: img.id,
        url: img.url,
        altText: img.altText,
        sortOrder: img.sortOrder,
      })),
    variants: p.variants
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((v) => ({
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
}

// Prisma include pattern (reusable)
const PRODUCT_INCLUDE = {
  category: true,
  images: { orderBy: { sortOrder: "asc" as const } },
  variants: {
    orderBy: { sortOrder: "asc" as const },
    include: { inventory: true },
  },
} as const;

// ── Repository Functions ──────────────────────────────────────

export async function getAllProducts(categorySlug?: string): Promise<Product[]> {
  if (!USE_DB) {
    const mock = await getMock();
    return mock.getAllProducts(categorySlug);
  }

  const where: Record<string, unknown> = { isPublished: true };
  if (categorySlug) {
    where.category = { slug: categorySlug };
  }

  const products = await prisma.product.findMany({
    where,
    include: PRODUCT_INCLUDE,
    orderBy: { sortOrder: "asc" },
  });
  return products.map((p) => mapProduct(p as unknown as NonNullable<PrismaProductFull>));
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  if (!USE_DB) {
    const mock = await getMock();
    return mock.getProductBySlug(slug);
  }

  const product = await prisma.product.findFirst({
    where: { slug, isPublished: true },
    include: PRODUCT_INCLUDE,
  });
  return product ? mapProduct(product as unknown as NonNullable<PrismaProductFull>) : null;
}

export async function getFeaturedProducts(limit = 4): Promise<Product[]> {
  if (!USE_DB) {
    const mock = await getMock();
    return mock.getFeaturedProducts(limit);
  }

  const products = await prisma.product.findMany({
    where: { isPublished: true, isFeatured: true },
    include: PRODUCT_INCLUDE,
    orderBy: { sortOrder: "asc" },
    take: limit,
  });
  return products.map((p) => mapProduct(p as unknown as NonNullable<PrismaProductFull>));
}

/**
 * Admin panel için — unpublished dahil tüm ürünler
 */
export async function getProductsForAdmin(): Promise<Product[]> {
  if (!USE_DB) {
    const mock = await getMock();
    // Admin mock: tümünü döndür (published filter yok)
    return mock.MOCK_PRODUCTS;
  }

  const products = await prisma.product.findMany({
    include: PRODUCT_INCLUDE,
    orderBy: { sortOrder: "asc" },
  });

  return products.map((p) => mapProduct(p as unknown as NonNullable<PrismaProductFull>));
}

/**
 * Admin panel — tekil ürün (unpublished dahil)
 */
export async function getProductByIdForAdmin(id: string): Promise<Product | null> {
  if (!USE_DB) {
    const mock = await getMock();
    return mock.MOCK_PRODUCTS.find((p) => p.id === id) ?? null;
  }

  const product = await prisma.product.findUnique({
    where: { id },
    include: PRODUCT_INCLUDE,
  });

  return product ? mapProduct(product as unknown as NonNullable<PrismaProductFull>) : null;
}
