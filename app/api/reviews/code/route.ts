/**
 * POST /api/reviews/code { code, orderRef? } — üye olmadan verilmiş siparişin tek kullanımlık değerlendirme kodunu
 * kullanır (lib/reviews/review-code.ts). Doğruysa ve sipariş teslim edildiyse kod harcanır, bu tarayıcıya 30 günlük
 * değerlendirme izni verilir (httpOnly çerez) ve sipariş numarası döner (istemci "Ürünleri değerlendirin"e gider).
 * Bu tarayıcı kodu zaten kullandıysa kod yeniden harcanmadan aynı izinle devam edilir.
 *
 * Kaba kuvvete karşı IP başına 15 dakikada 12 deneme (40 bitlik kodda tahmin pratikte imkânsız; mobil operatörde
 * aynı IP'yi paylaşan müşteriler takılmasın diye çok dar değil). Yönetici hesabı kod kullanamaz (müşterinin kodu harcanmasın).
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/auth/roles";
import {
  REVIEW_GRANT_COOKIE,
  REVIEW_GRANT_DAYS,
  addGrantToCookie,
  parseGrantCookie,
  redeemReviewCode,
  type RedeemResult,
} from "@/lib/reviews/review-code";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { isSameOrigin } from "@/lib/security/same-origin";
import { ACCOUNT_MESSAGES } from "@/lib/validation/account";

export const dynamic = "force-dynamic";

const FAILURES: Record<Extract<RedeemResult, { ok: false }>["reason"], { status: number; error: string }> = {
  invalid: {
    status: 400,
    error: "Kod hatalı. Paketinizdeki fişte ya da teslim e-postanızda yazan 8 karakterli kodu kontrol edin.",
  },
  used: {
    status: 409,
    error:
      "Bu kod daha önce kullanıldı. Değerlendirmenizi kodu kullandığınız cihazdan yazıp düzenleyebilirsiniz; yeni kod gerekirse bize ulaşın.",
  },
  not_delivered: { status: 403, error: "Siparişiniz teslim edildiğinde bu kodla değerlendirme yazabilirsiniz." },
  closed: { status: 403, error: "Bu sipariş iptal ya da iade edildiği için değerlendirme yazılamaz." },
};

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: ACCOUNT_MESSAGES.generic }, { status: 403 });
  }
  const session = await getCurrentCustomer().catch(() => null);
  if (session && isStaffRole(session.role)) {
    return NextResponse.json({ error: "Yönetici hesabıyla değerlendirme kodu kullanılamaz." }, { status: 403 });
  }
  if (!rateLimit(`review-code:${clientIp(request.headers)}`, 12, 15 * 60_000)) {
    return NextResponse.json({ error: ACCOUNT_MESSAGES.tooMany }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const code = typeof body?.code === "string" ? body.code.slice(0, 40) : "";
  const orderRef = typeof body?.orderRef === "string" ? body.orderRef.trim().slice(0, 60) : undefined;
  const existing = request.cookies.get(REVIEW_GRANT_COOKIE)?.value;

  try {
    const result = await redeemReviewCode(code, { orderRef: orderRef || undefined, tokens: parseGrantCookie(existing) });
    if (!result.ok) {
      const f = FAILURES[result.reason];
      return NextResponse.json({ error: f.error, reason: result.reason }, { status: f.status });
    }
    const res = NextResponse.json({ success: true, reference: result.reference });
    if (result.grantToken) {
      res.cookies.set(REVIEW_GRANT_COOKIE, addGrantToCookie(existing, result.grantToken), {
        httpOnly: true,
        sameSite: "lax",
        // Yayındaki site https: çerez yalnız şifreli bağlantıda gider (yerel denemede http)
        secure: (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://"),
        path: "/",
        maxAge: REVIEW_GRANT_DAYS * 24 * 60 * 60,
      });
    }
    return res;
  } catch (err) {
    console.error("[/api/reviews/code POST]", err);
    return NextResponse.json({ error: ACCOUNT_MESSAGES.unavailable }, { status: 503 });
  }
}
