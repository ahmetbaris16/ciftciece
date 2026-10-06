/**
 * Ürün değerlendirmesi (ürünü satın almış üye müşteri)
 *
 * GET  /api/reviews?productId=… — giriş durumu, değerlendirme hakkı ve müşterinin bu üründeki değerlendirmesi
 * POST /api/reviews             — değerlendirme gönder/güncelle → hemen yayında (onay yok)
 *
 * Hak: hesabına bağlı, kargoya verilmiş ya da teslim edilmiş siparişte bu ürün (lib/repositories/product-review).
 * Yönetici hesabı değerlendirme yazamaz. Yayınlanınca ürün sayfasının önbelleği tazelenir.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { scheduleNotifications } from "@/lib/notifications/run";
import { getCurrentCustomer } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/auth/roles";
import {
  ReviewNotAllowedError,
  ReviewProductNotFoundError,
  getMyReviewForProduct,
  reviewEligibility,
  submitReview,
} from "@/lib/repositories/product-review.repository";
import { rateLimit } from "@/lib/security/rate-limit";
import { isSameOrigin } from "@/lib/security/same-origin";
import { ACCOUNT_MESSAGES, ReviewSchema, accountFieldErrors } from "@/lib/validation/account";

export const dynamic = "force-dynamic";

const NOT_ALLOWED: Record<ReviewNotAllowedError["eligibility"], string> = {
  awaiting_shipment: "Siparişiniz kargoya verildiğinde bu ürünü değerlendirebilirsiniz.",
  not_purchased: "Bu ürünü değerlendirmek için sitemizden üye girişiyle satın almış olmanız gerekir.",
};

export async function GET(request: NextRequest) {
  const productId = request.nextUrl.searchParams.get("productId");
  if (!productId) return NextResponse.json({ error: "Ürün seçilmedi." }, { status: 400 });
  const noStore = { headers: { "Cache-Control": "no-store" } };

  const session = await getCurrentCustomer();
  if (!session) return NextResponse.json({ loggedIn: false }, noStore);
  if (isStaffRole(session.role)) return NextResponse.json({ loggedIn: true, staff: true }, noStore);

  try {
    const [review, eligibility] = await Promise.all([
      getMyReviewForProduct(productId, session.id),
      reviewEligibility(productId, session.id),
    ]);
    return NextResponse.json({ loggedIn: true, staff: false, eligibility, review }, noStore);
  } catch (err) {
    console.error("[/api/reviews GET]", err);
    return NextResponse.json({ error: ACCOUNT_MESSAGES.unavailable }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: ACCOUNT_MESSAGES.generic }, { status: 403 });
  }
  const session = await getCurrentCustomer();
  if (!session) {
    return NextResponse.json({ error: "Değerlendirme yazmak için giriş yapın." }, { status: 401 });
  }
  if (isStaffRole(session.role)) {
    return NextResponse.json({ error: ACCOUNT_MESSAGES.staffReview }, { status: 403 });
  }

  const parsed = ReviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const { fieldErrors, message } = accountFieldErrors(parsed.error);
    return NextResponse.json({ error: message, fieldErrors }, { status: 400 });
  }

  if (!rateLimit(`review:${session.id}`, 10, 60 * 60_000)) {
    return NextResponse.json({ error: ACCOUNT_MESSAGES.tooMany }, { status: 429 });
  }

  try {
    const { review, productSlug } = await submitReview({ ...parsed.data, userId: session.id });
    revalidatePath(`/urun/${productSlug}`);
    scheduleNotifications();
    return NextResponse.json({ success: true, review });
  } catch (err) {
    if (err instanceof ReviewProductNotFoundError) {
      return NextResponse.json({ error: "Bu ürün artık satışta değil." }, { status: 404 });
    }
    if (err instanceof ReviewNotAllowedError) {
      return NextResponse.json({ error: NOT_ALLOWED[err.eligibility], eligibility: err.eligibility }, { status: 403 });
    }
    console.error("[/api/reviews POST]", err);
    return NextResponse.json({ error: ACCOUNT_MESSAGES.unavailable }, { status: 503 });
  }
}
