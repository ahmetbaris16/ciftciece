/**
 * Ürün değerlendirmesi (üye müşteri)
 *
 * GET  /api/reviews?productId=… — giriş yapmış müşterinin bu üründeki değerlendirmesi (durumuyla)
 * POST /api/reviews             — değerlendirme gönder/güncelle → "Onay bekliyor"
 *
 * Yayına alma admin panelinden (Yorumlar → Ürün değerlendirmeleri) yapılır.
 */

import { NextRequest, NextResponse } from "next/server";
import { scheduleNotifications } from "@/lib/notifications/run";
import { getCurrentCustomer } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/auth/roles";
import {
  ReviewProductNotFoundError,
  getMyReviewForProduct,
  submitReview,
} from "@/lib/repositories/product-review.repository";
import { rateLimit } from "@/lib/security/rate-limit";
import { isSameOrigin } from "@/lib/security/same-origin";
import { ACCOUNT_MESSAGES, ReviewSchema, accountFieldErrors } from "@/lib/validation/account";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const productId = request.nextUrl.searchParams.get("productId");
  if (!productId) return NextResponse.json({ error: "Ürün seçilmedi." }, { status: 400 });

  const session = await getCurrentCustomer();
  if (!session) return NextResponse.json({ loggedIn: false }, { headers: { "Cache-Control": "no-store" } });

  try {
    const review = await getMyReviewForProduct(productId, session.id);
    return NextResponse.json({ loggedIn: true, review }, { headers: { "Cache-Control": "no-store" } });
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
    const review = await submitReview({ ...parsed.data, userId: session.id });
    scheduleNotifications();
    return NextResponse.json({ success: true, review });
  } catch (err) {
    if (err instanceof ReviewProductNotFoundError) {
      return NextResponse.json({ error: "Bu ürün artık satışta değil." }, { status: 404 });
    }
    console.error("[/api/reviews POST]", err);
    return NextResponse.json({ error: ACCOUNT_MESSAGES.unavailable }, { status: 503 });
  }
}
