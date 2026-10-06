/**
 * Ürün değerlendirmeleri — yalnız ürünü satın almış üye müşteri yazar; yazınca hemen yayınlanır (onay yok).
 *
 * - Hak: üye girişliyken verilmiş, kargoya verilmiş ya da teslim edilmiş bir siparişte bu ürün olmalı (misafir
 *   siparişi e-postayla hesaba bağlanmaz). Ödenip henüz kargolanmamışsa "kargoya verilince" denir.
 * - Müşteri başına ürün başına tek değerlendirme; düzenlenirse yeni hâli hemen yayınlanır.
 * - Mağaza yönetici hesabı değerlendirme yazamaz (API'de denetlenir).
 * - Mağaza yalnız uygunsuz yorumu (hakaret, kişisel veri, ürünle ilgisiz içerik) yayından kaldırabilir (ürün
 *   sayfasında yöneticiye görünen düğme); kayıt silinmez, durumu REJECTED olur.
 * - Yorumlarda soyadı açık yazılmaz ("Ahmet B."); e-posta yalnız admin panelinde görünür.
 * - Eski kurallarla yazılmış ve onay bekleyen (PENDING) yorumlar yayında değildir; müşteri düzenleyip kaydederse
 *   (hakkı varsa) yayınlanır.
 * DATABASE_URL yoksa (yalnız development) .mock-data/product-reviews.json okunur; yazma yapılmaz (sipariş yok).
 */

import { writeOutbox } from "@/lib/outbox";
import { prisma } from "@/lib/db/prisma";
import { USE_DB, loadMock } from "@/lib/data/source";
import { readMock } from "@/lib/data/mock-store";
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


/** Yayında olmayan / bulunamayan ürüne değerlendirme */
export class ReviewProductNotFoundError extends Error {
  constructor() {
    super("PRODUCT_NOT_FOUND");
    this.name = "ReviewProductNotFoundError";
  }
}

/**
 * Değerlendirme hakkı:
 * - eligible: hesabında bu ürünün kargoya verilmiş ya da teslim edilmiş siparişi var
 * - awaiting_shipment: ödenmiş/hazırlanan siparişi var, henüz kargoya verilmedi
 * - not_purchased: hesabında bu ürünle (iptal edilmemiş) sipariş yok
 */
export type ReviewEligibility = "eligible" | "awaiting_shipment" | "not_purchased";

/** Hakkı olmayan müşterinin gönderimi */
export class ReviewNotAllowedError extends Error {
  constructor(public readonly eligibility: Exclude<ReviewEligibility, "eligible">) {
    super("REVIEW_NOT_ALLOWED");
    this.name = "ReviewNotAllowedError";
  }
}

const REVIEWABLE_STATUSES = ["SHIPPED", "DELIVERED"] as const;
const AWAITING_SHIPMENT_STATUSES = ["PAID", "PROCESSING"] as const;

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

/** Müşterinin bu ürünü değerlendirme hakkı (hesabına bağlı siparişlerden) */
export async function reviewEligibility(productId: string, userId: string): Promise<ReviewEligibility> {
  if (!USE_DB) return "not_purchased"; // veritabanısız modda sipariş yok
  const rows = await prisma.orderItem.findMany({
    where: {
      variant: { productId },
      order: { userId, status: { in: [...REVIEWABLE_STATUSES, ...AWAITING_SHIPMENT_STATUSES] } },
    },
    select: { order: { select: { status: true } } },
    take: 20,
  });
  if (rows.some((r) => (REVIEWABLE_STATUSES as readonly string[]).includes(r.order.status))) return "eligible";
  return rows.length > 0 ? "awaiting_shipment" : "not_purchased";
}

/**
 * Değerlendirme gönder/güncelle → hemen yayında. Ürün yayında değilse ReviewProductNotFoundError, hakkı yoksa
 * ReviewNotAllowedError. Dönen ürün adresi sayfa önbelleğini tazelemek içindir.
 */
export async function submitReview(input: {
  productId: string;
  userId: string;
  rating: number;
  title: string | null;
  text: string;
}): Promise<{ review: MyProductReview; productSlug: string }> {
  if (!USE_DB) throw new ReviewNotAllowedError("not_purchased");

  const product = await prisma.product.findFirst({
    where: { id: input.productId, isPublished: true },
    select: { id: true, slug: true },
  });
  if (!product) throw new ReviewProductNotFoundError();

  const eligibility = await reviewEligibility(input.productId, input.userId);
  if (eligibility !== "eligible") throw new ReviewNotAllowedError(eligibility);

  const now = new Date();
  const data = {
    rating: input.rating,
    title: input.title,
    text: input.text,
    status: "APPROVED" as const,
    isVerifiedPurchase: true,
    adminNote: null,
    approvedAt: now,
  };
  // Değerlendirme ve işletmeye "yeni değerlendirme yayınlandı" bildirimi aynı işlemde
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
  return { review: toMine(r), productSlug: product.slug };
}

// ── Mağaza ───────────────────────────────────────────────────

/**
 * Uygunsuz yorumu yayından kaldırır (hakaret, kişisel veri, ürünle ilgisiz içerik). Kayıt silinmez.
 * Dönen ürün adresi sayfa önbelleğini tazelemek içindir; bulunamazsa null.
 */
export async function hideReview(id: string): Promise<{ productSlug: string } | null> {
  if (!USE_DB) return null;
  try {
    const r = await prisma.productReview.update({
      where: { id },
      data: { status: "REJECTED", adminNote: "Mağaza tarafından yayından kaldırıldı", approvedAt: null },
      include: { product: { select: { slug: true } } },
    });
    return { productSlug: r.product.slug };
  } catch (err) {
    if ((err as { code?: string }).code === "P2025") return null;
    throw err;
  }
}
