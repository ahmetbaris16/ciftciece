/**
 * Development mock verisi — SADECE DATABASE_URL tanımlı değilken (bkz. lib/data/source.ts).
 *
 * Ayrı, elle tutulan bir ürün listesi YOK: her şey prisma/catalog.ts'den üretilir.
 * Böylece mock'ta gerçekte olmayan ürün/görsel/fiyat bulunamaz.
 */

import type { Category, Product } from "@/types";
import { CATEGORIES, PRODUCTS, REVIEWS } from "@/prisma/catalog";

export const MOCK_CATEGORIES: Category[] = CATEGORIES.map((c) => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  description: c.description,
  imageUrl: c.imageUrl,
  sortOrder: c.sortOrder,
  isPublished: c.isPublished,
}));

const categoryBySlug = new Map(MOCK_CATEGORIES.map((c) => [c.slug, c]));

export const MOCK_PRODUCTS: Product[] = PRODUCTS.flatMap((p) => {
  const category = categoryBySlug.get(p.categorySlug);
  if (!category) return [];
  return [
    {
      id: `mock-${p.slug}`,
      name: p.name,
      slug: p.slug,
      description: p.description,
      categoryId: category.id,
      category,
      images: p.images.map((img) => ({
        id: `mock-img-${p.slug}-${img.sortOrder}`,
        url: img.url,
        altText: img.altText,
        sortOrder: img.sortOrder,
      })),
      variants: p.variants.map((v) => ({
        id: `mock-var-${v.sku}`,
        name: v.name,
        sku: v.sku,
        priceKurus: v.priceKurus,
        isAvailable: true,
        sortOrder: v.sortOrder,
        stockQuantity: v.stock,
      })),
      isPublished: p.isPublished,
      isFeatured: p.isFeatured,
      sortOrder: p.sortOrder,
    },
  ];
});

const published = () => MOCK_PRODUCTS.filter((p) => p.isPublished && category(p).isPublished);
const category = (p: Product) => categoryBySlug.get(p.category.slug) as Category;
const bySort = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;

export function getAllCategories(): Category[] {
  return MOCK_CATEGORIES.filter((c) => c.isPublished).sort(bySort);
}

export function getCategoryBySlug(slug: string): Category | null {
  const c = categoryBySlug.get(slug);
  return c && c.isPublished ? c : null;
}

export function getAllProducts(categorySlug?: string): Product[] {
  return published()
    .filter((p) => !categorySlug || p.category.slug === categorySlug)
    .sort(bySort);
}

export function getProductBySlug(slug: string): Product | null {
  return published().find((p) => p.slug === slug) ?? null;
}

export function getFeaturedProducts(limit = 4): Product[] {
  return published().filter((p) => p.isFeatured).sort(bySort).slice(0, limit);
}

export function getVariantById(variantId: string) {
  for (const product of MOCK_PRODUCTS) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant) return { product, variant };
  }
  return null;
}

export function searchProducts(query: string): Product[] {
  const q = query.toLocaleLowerCase("tr-TR").trim();
  if (!q) return [];
  return published().filter(
    (p) =>
      p.name.toLocaleLowerCase("tr-TR").includes(q) ||
      p.description?.toLocaleLowerCase("tr-TR").includes(q) ||
      p.category.name.toLocaleLowerCase("tr-TR").includes(q)
  );
}

export interface MockReview {
  id: string;
  authorName: string;
  authorAvatar: string | null;
  rating: number;
  text: string;
  date: Date;
  source: string | null;
  sourceUrl: string | null;
  isPublished: boolean;
  sortOrder: number;
}

export const MOCK_REVIEWS: MockReview[] = REVIEWS.map((r, i) => ({
  id: `mock-rev-${i + 1}`,
  authorName: r.authorName,
  authorAvatar: null,
  rating: r.rating,
  text: r.text,
  date: r.date,
  source: r.source,
  sourceUrl: null,
  isPublished: true,
  sortOrder: r.sortOrder,
}));

export function getPublishedMockReviews(): MockReview[] {
  return MOCK_REVIEWS.filter((r) => r.isPublished).sort(bySort);
}
