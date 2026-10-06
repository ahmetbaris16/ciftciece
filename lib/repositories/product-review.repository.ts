/**
 * Ürün değerlendirmeleri — yalnız ürünü satın almış müşteri yazar; yazınca hemen yayınlanır (onay yok).
 *
 * - Hak: bu ürünü içeren sipariş TESLİM EDİLMİŞ olmalı (kullanıcı kararı). Verilmiş ama henüz teslim edilmemiş
 *   siparişte "teslim edilince" denir.
 * - Üye: hesabına bağlı (üye girişiyle verilmiş) siparişten; ürün sayfasından ya da kendi sipariş sayfasından yazar.
 *   Üye başına ürün başına tek değerlendirme.
 * - Üye olmadan verilmiş (misafir) sipariş: o siparişin sayfasından yazılır — sipariş numarası (tahmin edilemez
 *   referans) sipariş sayfasının da anahtarıdır; teslim e-postasındaki bağlantı oraya gider. Sipariş başına ürün başına
 *   tek değerlendirme; adı siparişteki addan ("Ayşe K."). Misafir siparişi e-postayla üyeliğe bağlanmaz (e-posta
 *   doğrulanmadığı için), üyelikle verilmiş siparişin sayfasından ise giriş yapmadan yazılamaz.
 * - Düzenlenirse yeni hâli hemen yayınlanır.
 * - Mağaza yönetici hesabı değerlendirme yazamaz (API'de denetlenir).
 * - Mağaza yalnız uygunsuz yorumu (hakaret, kişisel veri, ürünle ilgisiz içerik) yayından kaldırabilir (ürün
 *   sayfasında yöneticiye görünen düğme); kayıt silinmez, durumu REJECTED olur.
 * - Yorumlarda soyadı açık yazılmaz ("Ahmet B."); e-posta yalnız admin panelinde görünür.
 * - Eski kurallarla yazılmış ve onay bekleyen (PENDING) yorumlar yayında değildir; müşteri düzenleyip kaydederse
 *   (hakkı varsa) yayınlanır.
 * DATABASE_URL yoksa (yalnız development) .mock-data/product-reviews.json okunur; yazma yapılmaz (sipariş yok).
 */

import type { Prisma } from "@prisma/client";
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
 * - eligible: bu ürünü içeren teslim edilmiş siparişi var
 * - awaiting_delivery: verilmiş (ödemesi bekleniyor / ödenmiş / hazırlanıyor / kargoda) siparişi var, henüz teslim
 *   edilmedi
 * - not_purchased: bu ürünle (iptal edilmemiş) siparişi yok
 */
export type ReviewEligibility = "eligible" | "awaiting_delivery" | "not_purchased";

/** Hakkı olmayan müşterinin gönderimi */
export class ReviewNotAllowedError extends Error {
  constructor(public readonly eligibility: Exclude<ReviewEligibility, "eligible">) {
    super("REVIEW_NOT_ALLOWED");
    this.name = "ReviewNotAllowedError";
  }
}

/** Üyelikle verilmiş siparişin sayfasından girişsiz gönderim: değerlendirme üyenin hesabına yazılır, giriş gerekir */
export class ReviewNeedsLoginError extends Error {
  constructor() {
    super("REVIEW_NEEDS_LOGIN");
    this.name = "ReviewNeedsLoginError";
  }
}

const REVIEWABLE_STATUSES = ["DELIVERED"] as const;
// Verilmiş ama henüz teslim edilmemiş sipariş (ödemesi bekleniyor / ödenmiş / hazırlanıyor / kargoda): "teslim edilince"
const AWAITING_DELIVERY_STATUSES = ["PENDING", "PAID", "PROCESSING", "SHIPPED"] as const;

const isReviewable = (status: string) => (REVIEWABLE_STATUSES as readonly string[]).includes(status);
const isAwaitingDelivery = (status: string) => (AWAITING_DELIVERY_STATUSES as readonly string[]).includes(status);

/** Misafir değerlendirmesinde görünen ad: siparişteki ad (yoksa teslimat adresindeki ad soyad) */
function orderCustomerName(order: { guestName: string | null; shippingAddress: unknown } | null): string | null {
  if (!order) return null;
  const a = (order.shippingAddress ?? {}) as { firstName?: string; lastName?: string };
  return order.guestName?.trim() || `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() || null;
}

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
    include: { user: { select: { name: true } }, order: { select: { guestName: true, shippingAddress: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return {
    summary: summarize(rows.map((r) => r.rating)),
    reviews: rows.map((r) => ({
      id: r.id,
      authorName: publicDisplayName(r.user?.name ?? orderCustomerName(r.order)),
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

/** Üyenin bu ürünü değerlendirme hakkı (hesabına bağlı siparişlerden) */
export async function reviewEligibility(productId: string, userId: string): Promise<ReviewEligibility> {
  if (!USE_DB) return "not_purchased"; // veritabanısız modda sipariş yok
  const rows = await prisma.orderItem.findMany({
    where: {
      variant: { productId },
      order: { userId, status: { in: [...REVIEWABLE_STATUSES, ...AWAITING_DELIVERY_STATUSES] } },
    },
    select: { order: { select: { status: true } } },
    take: 20,
  });
  if (rows.some((r) => isReviewable(r.order.status))) return "eligible";
  return rows.length > 0 ? "awaiting_delivery" : "not_purchased";
}

const publishedData = (input: { rating: number; title: string | null; text: string }, now: Date) => ({
  rating: input.rating,
  title: input.title,
  text: input.text,
  status: "APPROVED" as const,
  isVerifiedPurchase: true,
  adminNote: null,
  approvedAt: now,
});

/** Değerlendirmeyi yazar/günceller ve işletmeye "yeni değerlendirme yayınlandı" bildirimini aynı işlemde kuyruğa koyar */
async function publishReview(
  where: Prisma.ProductReviewWhereUniqueInput,
  create: Prisma.ProductReviewUncheckedCreateInput,
  update: ReturnType<typeof publishedData>
) {
  return prisma.$transaction(async (tx) => {
    const saved = await tx.productReview.upsert({ where, create, update });
    await writeOutbox(tx, {
      topic: "review.submitted",
      aggregateType: "review",
      aggregateId: saved.id,
      dedupeKey: `review:${saved.id}:${saved.updatedAt.getTime()}`,
      payload: { reviewId: saved.id },
    });
    return saved;
  });
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

  const data = publishedData(input, new Date());
  const r = await publishReview(
    { productId_userId: { productId: input.productId, userId: input.userId } },
    { productId: input.productId, userId: input.userId, ...data },
    data
  );
  return { review: toMine(r), productSlug: product.slug };
}

// ── Sipariş sayfası ──────────────────────────────────────────

export interface OrderReviewItem {
  productId: string;
  productName: string;
  productSlug: string;
  /** Misafir siparişinde bu siparişten, üye siparişinde üyenin hesabından yazılmış değerlendirme */
  review: MyProductReview | null;
}

export interface OrderReviewContext {
  /** Siparişi veren üye; misafir siparişinde null */
  userId: string | null;
  /** Teslim edildi: değerlendirme yazılabilir */
  delivered: boolean;
  /** Siparişteki yayında ürünler (aynı ürün bir kez) */
  items: OrderReviewItem[];
}

/** Sipariş sayfasının "Ürünleri değerlendirin" bölümü için: siparişteki ürünler ve yazılmış değerlendirmeler */
export async function getOrderReviewContext(reference: string): Promise<OrderReviewContext | null> {
  if (!USE_DB) return null;
  const order = await prisma.order.findUnique({
    where: { reference },
    select: {
      id: true,
      userId: true,
      status: true,
      items: { select: { variant: { select: { product: { select: { id: true, name: true, slug: true, isPublished: true } } } } } },
    },
  });
  if (!order) return null;
  const products = new Map<string, { id: string; name: string; slug: string }>();
  for (const item of order.items) {
    const p = item.variant.product;
    if (p.isPublished && !products.has(p.id)) products.set(p.id, { id: p.id, name: p.name, slug: p.slug });
  }
  const ids = [...products.keys()];
  const reviews =
    ids.length === 0
      ? []
      : await prisma.productReview.findMany({
          where: order.userId ? { userId: order.userId, productId: { in: ids } } : { orderId: order.id, productId: { in: ids } },
        });
  const byProduct = new Map(reviews.map((r) => [r.productId, toMine(r)]));
  return {
    userId: order.userId,
    delivered: isReviewable(order.status),
    items: [...products.values()].map((p) => ({
      productId: p.id,
      productName: p.name,
      productSlug: p.slug,
      review: byProduct.get(p.id) ?? null,
    })),
  };
}

/**
 * Üye olmadan verilmiş siparişten değerlendirme gönder/güncelle → hemen yayında. Anahtar sipariş numarasıdır (sipariş
 * sayfası gibi). Sipariş üyelikle verildiyse ReviewNeedsLoginError; ürün siparişte yoksa ya da sipariş teslim
 * edilmediyse ReviewNotAllowedError; ürün yayında değilse ReviewProductNotFoundError.
 */
export async function submitOrderReview(input: {
  reference: string;
  productId: string;
  rating: number;
  title: string | null;
  text: string;
}): Promise<{ review: MyProductReview; productSlug: string }> {
  if (!USE_DB) throw new ReviewNotAllowedError("not_purchased");

  const order = await prisma.order.findUnique({
    where: { reference: input.reference },
    select: {
      id: true,
      userId: true,
      status: true,
      items: { where: { variant: { productId: input.productId } }, select: { id: true }, take: 1 },
    },
  });
  if (!order || order.items.length === 0) throw new ReviewNotAllowedError("not_purchased");
  if (order.userId) throw new ReviewNeedsLoginError();

  const product = await prisma.product.findFirst({
    where: { id: input.productId, isPublished: true },
    select: { id: true, slug: true },
  });
  if (!product) throw new ReviewProductNotFoundError();

  if (!isReviewable(order.status)) {
    throw new ReviewNotAllowedError(isAwaitingDelivery(order.status) ? "awaiting_delivery" : "not_purchased");
  }

  const data = publishedData(input, new Date());
  const r = await publishReview(
    { productId_orderId: { productId: input.productId, orderId: order.id } },
    { productId: input.productId, orderId: order.id, ...data },
    data
  );
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
