/**
 * Ürün değerlendirmesi (ürünü satın almış müşteri; sipariş teslim edildikten sonra)
 *
 * GET  /api/reviews?productId=… — giriş durumu, değerlendirme hakkı ve üyenin bu üründeki değerlendirmesi
 * POST /api/reviews             — değerlendirme gönder/güncelle → hemen yayında (onay yok)
 *   - Üye: gövdede orderRef yok; hak hesabına bağlı teslim edilmiş siparişten (lib/repositories/product-review).
 *   - Üye olmadan verilmiş sipariş: gövdede orderRef (sipariş numarası) — sipariş sayfasındaki form gönderir; giriş
 *     gerekmez ama sipariş numarası yetmez (F-33): tek kullanımlık değerlendirme kodunu kullanmış tarayıcının izni
 *     (çerez, /api/reviews/code) gerekir; yoksa 401 needsCode.
 *
 * Yönetici hesabı değerlendirme yazamaz. Yayınlanınca ürün sayfasının önbelleği tazelenir.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidateProductPage } from "@/lib/cache/revalidate";
import { scheduleNotifications } from "@/lib/notifications/run";
import { getCurrentCustomer } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/auth/roles";
import {
  ReviewNeedsCodeError,
  ReviewNeedsLoginError,
  ReviewNotAllowedError,
  ReviewProductNotFoundError,
  getMyReviewForProduct,
  reviewEligibility,
  submitOrderReview,
  submitReview,
} from "@/lib/repositories/product-review.repository";
import { REVIEW_GRANT_COOKIE, parseGrantCookie } from "@/lib/reviews/review-code";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { isSameOrigin } from "@/lib/security/same-origin";
import { ACCOUNT_MESSAGES, ReviewSchema, accountFieldErrors } from "@/lib/validation/account";

export const dynamic = "force-dynamic";

const NOT_ALLOWED: Record<ReviewNotAllowedError["eligibility"], string> = {
  awaiting_delivery: "Siparişiniz teslim edildiğinde bu ürünü değerlendirebilirsiniz.",
  not_purchased: "Bu ürünü değerlendirmek için sitemizden satın almış ve teslim almış olmanız gerekir.",
};

const NEEDS_LOGIN = "Bu siparişi üyeliğinizle verdiniz. Değerlendirmek için giriş yapın.";
const NEEDS_CODE =
  "Değerlendirme yazmak için paketinizdeki fişte ya da teslim e-postanızda yazan değerlendirme kodunu girin.";

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
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const orderRef = typeof body?.orderRef === "string" ? body.orderRef.trim().slice(0, 60) : "";

  // Girişsiz misafir yolunda oturum okunamazsa (oturum yok) yalnız yönetici engeli atlanır; hak siparişten denetlenir
  const session = orderRef ? await getCurrentCustomer().catch(() => null) : await getCurrentCustomer();
  if (!orderRef && !session) {
    return NextResponse.json({ error: "Değerlendirme yazmak için giriş yapın." }, { status: 401 });
  }
  if (session && isStaffRole(session.role)) {
    return NextResponse.json({ error: ACCOUNT_MESSAGES.staffReview }, { status: 403 });
  }

  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) {
    const { fieldErrors, message } = accountFieldErrors(parsed.error);
    return NextResponse.json({ error: message, fieldErrors }, { status: 400 });
  }

  const limitKey = orderRef ? `review-order:${clientIp(request.headers)}` : `review:${session!.id}`;
  if (!rateLimit(limitKey, 10, 60 * 60_000)) {
    return NextResponse.json({ error: ACCOUNT_MESSAGES.tooMany }, { status: 429 });
  }

  try {
    const { review, productSlug } = orderRef
      ? await submitOrderReview({
          ...parsed.data,
          reference: orderRef,
          grantTokens: parseGrantCookie(request.cookies.get(REVIEW_GRANT_COOKIE)?.value),
        })
      : await submitReview({ ...parsed.data, userId: session!.id });
    revalidateProductPage(productSlug);
    scheduleNotifications();
    return NextResponse.json({ success: true, review });
  } catch (err) {
    if (err instanceof ReviewProductNotFoundError) {
      return NextResponse.json({ error: "Bu ürün artık satışta değil." }, { status: 404 });
    }
    if (err instanceof ReviewNeedsLoginError) {
      return NextResponse.json({ error: NEEDS_LOGIN, needsLogin: true }, { status: 401 });
    }
    if (err instanceof ReviewNeedsCodeError) {
      return NextResponse.json({ error: NEEDS_CODE, needsCode: true }, { status: 401 });
    }
    if (err instanceof ReviewNotAllowedError) {
      return NextResponse.json({ error: NOT_ALLOWED[err.eligibility], eligibility: err.eligibility }, { status: 403 });
    }
    console.error("[/api/reviews POST]", err);
    return NextResponse.json({ error: ACCOUNT_MESSAGES.unavailable }, { status: 503 });
  }
}
