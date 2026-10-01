/**
 * /api/payment/verify — ödeme sağlayıcısı dönüşü (callbackUrl)
 *
 * Tarayıcı dönüşü yalnız TETİKLEYİCİDİR, kanıt değildir:
 * 1. Gelen token bir ödeme denemesiyle eşleştirilir (adresteki ?attempt= yalnız ipucu)
 * 2. Sonuç sağlayıcıdan sunucu tarafında sorgulanır ve doğrulanır (lib/payment/verify.ts)
 * 3. Kayıt tek transaction'da yapılır (lib/payment/apply.ts)
 * 4. Müşteri sipariş sayfasına (ya da başarısızsa ödeme sayfasına) yönlendirilir
 *
 * ?orderId= eski sürümün callback adresidir: bu sürümden önce açılmış formlar için kabul edilir.
 */

import { NextRequest, NextResponse } from "next/server";
import { USE_DB } from "@/lib/data/source";
import { handleCardCallback } from "@/lib/payment/card";

async function handle(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if (!USE_DB) return NextResponse.redirect(`${appUrl}/odeme?error=payment_error`, 303);

  const { searchParams } = new URL(request.url);
  let token = searchParams.get("token") ?? "";
  if (!token && request.method === "POST") {
    // iyzico token'ı form gövdesinde gönderir
    const form = await request.formData().catch(() => null);
    const value = form?.get("token");
    token = typeof value === "string" ? value : "";
  }

  try {
    const path = await handleCardCallback({
      token,
      attemptHint: searchParams.get("attempt"),
      orderIdHint: searchParams.get("orderId"),
    });
    // 303: POST dönüşünden sonra tarayıcı hedefi GET ile açsın
    return NextResponse.redirect(`${appUrl}${path}`, 303);
  } catch (err) {
    console.error("[payment/verify]", err);
    return NextResponse.redirect(`${appUrl}/odeme?error=payment_error`, 303);
  }
}

export const GET = handle;
export const POST = handle;
