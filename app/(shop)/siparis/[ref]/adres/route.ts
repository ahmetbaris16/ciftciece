/**
 * GET /siparis/[ref]/adres?t=… — e-postadaki teslimat bilgisi değiştirme bağlantısı (lib/orders/access.ts).
 * Bağlantı geçerliyse bu tarayıcıya siparişin izin çerezi bırakılır ve sipariş sayfasında değiştirme formu açılır;
 * süresi dolmuş ya da bozuk bağlantıda sayfa "yeni bağlantı isteyin" der (çerez verilmez).
 */

import { NextRequest, NextResponse } from "next/server";
import { siteUrl } from "@/lib/email/brand";
import {
  ORDER_ACCESS_COOKIE,
  addOrderAccess,
  orderAccessCookieOptions,
  verifyOrderLinkToken,
} from "@/lib/orders/access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ ref: string }> }) {
  const { ref } = await context.params;
  const page = `${siteUrl()}/siparis/${encodeURIComponent(ref)}`;
  if (!verifyOrderLinkToken(ref, request.nextUrl.searchParams.get("t"))) {
    return NextResponse.redirect(`${page}?adres=gecersiz#teslimat`, 303);
  }
  const res = NextResponse.redirect(`${page}?adres=1#teslimat`, 303);
  res.cookies.set(
    ORDER_ACCESS_COOKIE,
    addOrderAccess(request.cookies.get(ORDER_ACCESS_COOKIE)?.value, ref),
    orderAccessCookieOptions()
  );
  // Bağlantıdaki imza tarayıcı geçmişinde/başlıklarda kalmasın
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
