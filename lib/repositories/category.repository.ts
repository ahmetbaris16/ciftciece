/**
 * Category Repository
 *
 * Prisma tabanlı kategori sorguları.
 * DATABASE_URL yoksa (sadece development) mock veri — bkz. lib/data/source.ts.
 */

import { prisma } from "@/lib/db/prisma";
import { USE_DB, loadMock as getMock } from "@/lib/data/source";
import type { Category } from "@/types";

export async function getAllCategories(): Promise<Category[]> {
  if (!USE_DB) {
    const mock = await getMock();
    return mock.getAllCategories();
  }

  const categories = await prisma.category.findMany({
    where: { isPublished: true },
    orderBy: { sortOrder: "asc" },
  });

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    imageUrl: c.imageUrl,
    sortOrder: c.sortOrder,
    isPublished: c.isPublished,
  }));
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  if (!USE_DB) {
    const mock = await getMock();
    return mock.getCategoryBySlug(slug);
  }

  const category = await prisma.category.findFirst({
    where: { slug, isPublished: true },
  });

  if (!category) return null;

  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    imageUrl: category.imageUrl,
    sortOrder: category.sortOrder,
    isPublished: category.isPublished,
  };
}

/**
 * Kategori başına yayındaki ürün sayısı (kategori id → adet).
 * Mock modda da gerçek sayı: prisma/catalog.ts'teki yayındaki ürünlerden sayılır.
 */
export async function getPublishedProductCounts(): Promise<Map<string, number>> {
  if (!USE_DB) {
    const mock = await getMock();
    const counts = new Map<string, number>();
    for (const p of mock.getAllProducts()) {
      counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
    }
    return counts;
  }

  const rows = await prisma.product.groupBy({
    by: ["categoryId"],
    where: { isPublished: true },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.categoryId, r._count._all]));
}

/**
 * Admin — unpublished dahil tüm kategoriler
 */
export async function getCategoriesForAdmin(): Promise<Category[]> {
  if (!USE_DB) {
    const mock = await getMock();
    return mock.MOCK_CATEGORIES;
  }

  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    imageUrl: c.imageUrl,
    sortOrder: c.sortOrder,
    isPublished: c.isPublished,
  }));
}
