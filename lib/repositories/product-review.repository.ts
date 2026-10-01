/**
 * Ürün değerlendirmeleri — üye müşteriler yazar, admin onaylar, yalnız onaylılar yayında.
 *
 * - Müşteri başına ürün başına tek değerlendirme; yeniden gönderilirse güncellenir ve tekrar onaya düşer.
 * - "Satın aldı" rozeti gönderim anında hesaplanır: müşterinin üye girişliyken verdiği ve ödemesi
 *   alınmış bir siparişte bu ürün varsa.
 * - Yorumlarda soyadı açık yazılmaz ("Ahmet B."); e-posta yalnız admin panelinde görünür.
 * DATABASE_URL yoksa (yalnız development) .mock-data/product-reviews.json kullanılır.
 */

import { randomUUID } from "node:crypto";
import { writeOutbox } from "@/lib/outbox";
import { prisma } from "@/lib/db/prisma";
import { USE_DB, loadMock } from "@/lib/data/source";
import { readMock, updateMock } from "@/lib/data/mock-store";
import { publicDisplayName } from "@/lib/validation/account";

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface PublicProductReview {
  id: string;
  authorName: string;
  rating: number;
  title: string | null;
  text: string;
  isVerifiedPurchase: boolean;
  createdAt: string; // ISO
}

export interface ReviewSummary {
  count: number;
  /** 0 = değerlendirme yok */
  average: number;
  /** index 0 → 1 yıldız … index 4 → 5 yıldız */
  distribution: [number, number, number, number, number];
}

export interface MyProductReview {
  id: string;
  productId: string;
  rating: number;
  title: string | null;
  text: string;
  status: ReviewStatus;
  isVerifiedPurchase: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MyReviewWithProduct extends MyProductReview {
  productName: string;
  productSlug: string;
}

export interface AdminProductReview {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  customerName: string;
  customerEmail: string;
  rating: number;
  title: string | null;
  text: string;
  status: ReviewStatus;
  isVerifiedPurchase: boolean;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Yayında olmayan / bulunamayan ürüne değerlendirme */
export class ReviewProductNotFoundError extends Error {
  constructor() {
    super("PRODUCT_NOT_FOUND");
    this.name = "ReviewProductNotFoundError";
  }
}

const PAID_STATUSES = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

export function emptySummary(): ReviewSummary {
  return { count: 0, average: 0, distribution: [0, 0, 0, 0, 0] };
}

function summarize(ratings: number[]): ReviewSummary {
  const s = emptySummary();
  for (const r of ratings) {
    if (r >= 1 && r <= 5) s.distribution[r - 1]++;
  }
  s.count = ratings.length;
  s.average = s.count ? Math.round((ratings.reduce((a, b) => a + b, 0) / s.count) * 10) / 10 : 0;
  return s;
}

// ── Geliştirme deposu ─────────────────────────────────────────

const REVIEWS_FILE = "product-reviews.json";

interface MockReview {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  title: string | null;
  text: string;
  status: ReviewStatus;
  isVerifiedPurchase: boolean;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
}

interface MockUserLite {
  id: string;
  email: string;
  name: string | null;
}

async function mockUsers(): Promise<Map<string, MockUserLite>> {
  const users = await readMock<MockUserLite[]>("users.json", []);
  return new Map(users.map((u) => [u.id, u]));
}

async function mockProducts() {
  const mock = await loadMock();
  return new Map(mock.MOCK_PRODUCTS.map((p) => [p.id, p]));
}

const toMine = (r: MockReview | { id: string; productId: string; rating: number; title: string | null; text: string; status: string; isVerifiedPurchase: boolean; createdAt: Date | string; updatedAt: Date | string }): MyProductReview => ({
  id: r.id,
  productId: r.productId,
  rating: r.rating,
  title: r.title,
  text: r.text,
  status: r.status as ReviewStatus,
  isVerifiedPurchase: r.isVerifiedPurchase,
  createdAt: new Date(r.createdAt).toISOString(),
  updatedAt: new Date(r.updatedAt).toISOString(),
});

// ── Vitrin ────────────────────────────────────────────────────

/** Ürün sayfası: onaylı değerlendirmeler (en yeni önce) + puan özeti */
export async function getProductReviews(
  productId: string
): Promise<{ reviews: PublicProductReview[]; summary: ReviewSummary }> {
  if (!USE_DB) {
    const [all, users] = await Promise.all([readMock<MockReview[]>(REVIEWS_FILE, []), mockUsers()]);
    const approved = all
      .filter((r) => r.productId === productId && r.status === "APPROVED")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      summary: summarize(approved.map((r) => r.rating)),
      reviews: approved.map((r) => ({
        id: r.id,
        authorName: publicDisplayName(users.get(r.userId)?.name),
        rating: r.rating,
        title: r.title,
        text: r.text,
        isVerifiedPurchase: r.isVerifiedPurchase,
        createdAt: r.createdAt,
      })),
    };
  }

  const rows = await prisma.productReview.findMany({
    where: { productId, status: "APPROVED" },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return {
    summary: summarize(rows.map((r) => r.rating)),
    reviews: rows.map((r) => ({
      id: r.id,
      authorName: publicDisplayName(r.user.name),
      rating: r.rating,
      title: r.title,
      text: r.text,
      isVerifiedPurchase: r.isVerifiedPurchase,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

// ── Müşteri ───────────────────────────────────────────────────

export async function getMyReviewForProduct(productId: string, userId: string): Promise<MyProductReview | null> {
  if (!USE_DB) {
    const all = await readMock<MockReview[]>(REVIEWS_FILE, []);
    const r = all.find((x) => x.productId === productId && x.userId === userId);
    return r ? toMine(r) : null;
  }
  const r = await prisma.productReview.findUnique({ where: { productId_userId: { productId, userId } } });
  return r ? toMine(r) : null;
}

export async function getMyReviews(userId: string): Promise<MyReviewWithProduct[]> {
  if (!USE_DB) {
    const [all, products] = await Promise.all([readMock<MockReview[]>(REVIEWS_FILE, []), mockProducts()]);
    return all
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((r) => ({
        ...toMine(r),
        productName: products.get(r.productId)?.name ?? "Ürün",
        productSlug: products.get(r.productId)?.slug ?? "",
      }));
  }
  const rows = await prisma.productReview.findMany({
    where: { userId },
    include: { product: { select: { name: true, slug: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((r) => ({ ...toMine(r), productName: r.product.name, productSlug: r.product.slug }));
}

/** Müşterinin ödemesi alınmış (üye girişli) bir siparişinde bu ürün var mı */
async function hasPurchased(productId: string, userId: string): Promise<boolean> {
  if (!USE_DB) return false; // veritabanısız modda sipariş yok
  const count = await prisma.orderItem.count({
    where: {
      variant: { productId },
      order: { userId, status: { in: [...PAID_STATUSES] } },
    },
  });
  return count > 0;
}

/**
 * Değerlendirme gönder/güncelle → her zaman "Onay bekliyor" durumuna düşer.
 * Ürün yayında değilse ReviewProductNotFoundError.
 */
export async function submitReview(input: {
  productId: string;
  userId: string;
  rating: number;
  title: string | null;
  text: string;
}): Promise<MyProductReview> {
  if (!USE_DB) {
    const products = await mockProducts();
    const product = products.get(input.productId);
    if (!product || !product.isPublished) throw new ReviewProductNotFoundError();
    const now = new Date().toISOString();
    return updateMock<MockReview[], MyProductReview>(REVIEWS_FILE, [], (all) => {
      const i = all.findIndex((r) => r.productId === input.productId && r.userId === input.userId);
      const base = {
        rating: input.rating,
        title: input.title,
        text: input.text,
        status: "PENDING" as const,
        isVerifiedPurchase: false,
        adminNote: null,
        approvedAt: null,
        updatedAt: now,
      };
      const next = all.slice();
      if (i >= 0) {
        next[i] = { ...next[i], ...base };
        return { next, result: toMine(next[i]) };
      }
      const created: MockReview = {
        id: `mock-review-${randomUUID()}`,
        productId: input.productId,
        userId: input.userId,
        createdAt: now,
        ...base,
      };
      next.push(created);
      return { next, result: toMine(created) };
    });
  }

  const product = await prisma.product.findFirst({
    where: { id: input.productId, isPublished: true },
    select: { id: true },
  });
  if (!product) throw new ReviewProductNotFoundError();

  const isVerifiedPurchase = await hasPurchased(input.productId, input.userId);
  const data = {
    rating: input.rating,
    title: input.title,
    text: input.text,
    status: "PENDING" as const,
    isVerifiedPurchase,
    adminNote: null,
    approvedAt: null,
  };
  // Değerlendirme ve işletmeye "onay bekliyor" bildirimi aynı işlemde
  const r = await prisma.$transaction(async (tx) => {
    const saved = await tx.productReview.upsert({
      where: { productId_userId: { productId: input.productId, userId: input.userId } },
      create: { productId: input.productId, userId: input.userId, ...data },
      update: data,
    });
    await writeOutbox(tx, {
      topic: "review.submitted",
      aggregateType: "review",
      aggregateId: saved.id,
      dedupeKey: `review:${saved.id}:${saved.updatedAt.getTime()}`,
      payload: { reviewId: saved.id },
    });
    return saved;
  });
  return toMine(r);
}

// ── Admin ─────────────────────────────────────────────────────

export async function getReviewsForAdmin(): Promise<AdminProductReview[]> {
  if (!USE_DB) {
    const [all, users, products] = await Promise.all([
      readMock<MockReview[]>(REVIEWS_FILE, []),
      mockUsers(),
      mockProducts(),
    ]);
    return all
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((r) => ({
        id: r.id,
        productId: r.productId,
        productName: products.get(r.productId)?.name ?? "Ürün",
        productSlug: products.get(r.productId)?.slug ?? "",
        customerName: users.get(r.userId)?.name ?? "—",
        customerEmail: users.get(r.userId)?.email ?? "—",
        rating: r.rating,
        title: r.title,
        text: r.text,
        status: r.status,
        isVerifiedPurchase: r.isVerifiedPurchase,
        adminNote: r.adminNote,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
  }

  const rows = await prisma.productReview.findMany({
    include: {
      product: { select: { name: true, slug: true } },
      user: { select: { name: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  return rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    productName: r.product.name,
    productSlug: r.product.slug,
    customerName: r.user.name ?? "—",
    customerEmail: r.user.email,
    rating: r.rating,
    title: r.title,
    text: r.text,
    status: r.status as ReviewStatus,
    isVerifiedPurchase: r.isVerifiedPurchase,
    adminNote: r.adminNote,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** Onayla / reddet. Dönen slug ürün sayfasının önbelleğini tazelemek içindir; bulunamazsa null. */
export async function moderateReview(
  id: string,
  status: Exclude<ReviewStatus, "PENDING">,
  adminNote: string | null
): Promise<{ productSlug: string } | null> {
  if (!USE_DB) {
    const products = await mockProducts();
    return updateMock<MockReview[], { productSlug: string } | null>(REVIEWS_FILE, [], (all) => {
      const i = all.findIndex((r) => r.id === id);
      if (i < 0) return { next: all, result: null };
      const next = all.slice();
      const now = new Date().toISOString();
      next[i] = {
        ...next[i],
        status,
        adminNote,
        approvedAt: status === "APPROVED" ? now : null,
      };
      return { next, result: { productSlug: products.get(next[i].productId)?.slug ?? "" } };
    });
  }

  try {
    const r = await prisma.productReview.update({
      where: { id },
      data: { status, adminNote, approvedAt: status === "APPROVED" ? new Date() : null },
      include: { product: { select: { slug: true } } },
    });
    return { productSlug: r.product.slug };
  } catch (err) {
    if ((err as { code?: string }).code === "P2025") return null;
    throw err;
  }
}

export async function deleteReview(id: string): Promise<{ productSlug: string } | null> {
  if (!USE_DB) {
    const products = await mockProducts();
    return updateMock<MockReview[], { productSlug: string } | null>(REVIEWS_FILE, [], (all) => {
      const r = all.find((x) => x.id === id);
      if (!r) return { next: all, result: null };
      return {
        next: all.filter((x) => x.id !== id),
        result: { productSlug: products.get(r.productId)?.slug ?? "" },
      };
    });
  }
  try {
    const r = await prisma.productReview.delete({
      where: { id },
      include: { product: { select: { slug: true } } },
    });
    return { productSlug: r.product.slug };
  } catch (err) {
    if ((err as { code?: string }).code === "P2025") return null;
    throw err;
  }
}

export async function countPendingReviews(): Promise<number> {
  if (!USE_DB) {
    const all = await readMock<MockReview[]>(REVIEWS_FILE, []);
    return all.filter((r) => r.status === "PENDING").length;
  }
  return prisma.productReview.count({ where: { status: "PENDING" } });
}
