/**
 * Search Repository
 *
 * Ürün arama.
 * DB modunda MariaDB'nin büyük/küçük harfe duyarsız karşılaştırması kullanılır (tablolar utf8mb4_unicode_ci:
 * "ZEYTİN", "ZEYTIN" ve "zeytin" aynı; ş/ç/ğ/ü/ö tabanıyla eşleşir — "seker" "Şeker"i bulur). Sınır:
 * noktasız "ı" "i" ile eşleşmez ("KIZARTILMIŞ" ≠ "kızartılmış"). Prisma'nın `mode: "insensitive"`
 * seçeneği MySQL'de yok, gerek de yok.
 * Mock modunda in-memory filter.
 */

import { prisma } from "@/lib/db/prisma";
import { USE_DB, loadMock as getMock } from "@/lib/data/source";
import { withActiveDiscounts } from "./discount.repository";
import type { Product } from "@/types";

// Reuse product include from product repository
const PRODUCT_INCLUDE = {
  category: true,
  images: { orderBy: { sortOrder: "asc" as const } },
  variants: {
    orderBy: { sortOrder: "asc" as const },
    include: { inventory: true },
  },
} as const;

export async function searchProducts(query: string): Promise<Product[]> {
  if (!USE_DB) {
    const mock = await getMock();
    return mock.searchProducts(query);
  }

  // Küçük harfe çevrilmez: JavaScript "İ"yi "i̇" (i + birleşik nokta) yapar ve eşleşmeyi bozar;
  // karşılaştırmayı veritabanının harmanlaması yapar.
  const q = query.trim();
  if (!q) return [];

  const products = await prisma.product.findMany({
    where: {
      isPublished: true,
      OR: [
        { name: { contains: q } },
        { description: { contains: q } },
        { category: { name: { contains: q } } },
      ],
    },
    include: PRODUCT_INCLUDE,
    orderBy: { sortOrder: "asc" },
    take: 50,
  });

  const mapped: Product[] = products.map((p) => ({
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
  }));
  return withActiveDiscounts(mapped);
}
