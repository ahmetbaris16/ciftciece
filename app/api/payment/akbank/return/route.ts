/**
 * Akbank ortak ödeme sayfasından dönüş (okUrl / failUrl): POST /api/payment/akbank/return?attempt=…
 *
 * Gelen form yalnız TETİKLEYİCİDİR (kanıt değil): imzası (hash/hashParams) denetlenip kaydedilir, ödeme sonucu
 * Akbank'tan sunucudan sorgulanır (lib/payment/verify.ts). Kart verisi (maskelenmiş numara dahil) kaydedilmez.
 * Akbank başka siteden POST eder: köken denetimi yapılmaz; oturum çerezi gerekmez.
 */

import { NextRequest, NextResponse } from "next/server";
import { USE_DB } from "@/lib/data/source";
import { handleCardCallback } from "@/lib/payment/card";
import { akbankConfigFromEnv, verifyAkbankReturnHash } from "@/lib/payment/providers/akbank";
import { scheduleNotifications } from "@/lib/notifications/run";

const MAX_FIELD = 2000;

async function handle(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if (!USE_DB) return NextResponse.redirect(`${appUrl}/odeme?error=payment_error`, 303);

  const fields: Record<string, string> = {};
  if (request.method === "POST") {
    const form = await request.formData().catch(() => null);
    form?.forEach((value, key) => {
      if (typeof value === "string" && key.length <= 64) fields[key] = value.slice(0, MAX_FIELD);
    });
  }
  const attemptHint = request.nextUrl.searchParams.get("attempt");
  // Akbank sipariş no'su = ödeme denemesi id'si
  const akbankOrderId = (fields.orderId || attemptHint || "").trim();

  const config = akbankConfigFromEnv();
  const hashValid = config && fields.hash ? verifyAkbankReturnHash(fields, config.secretKey) : null;
  if (hashValid === false) console.warn("[akbank/return] dönüş imzası doğrulanamadı; sonuç yine sunucudan sorgulanacak");

  try {
    const path = await handleCardCallback({
      token: akbankOrderId,
      attemptHint,
      meta: {
        provider: "akbank",
        responseCode: fields.responseCode?.slice(0, 40) ?? null,
        responseMessage: fields.responseMessage?.slice(0, 200) ?? null,
        hashValid,
      },
    });
    scheduleNotifications();
    return NextResponse.redirect(`${appUrl}${path}`, 303);
  } catch (err) {
    console.error("[akbank/return]", err);
    return NextResponse.redirect(`${appUrl}/odeme?error=${akbankOrderId ? "payment_unverified" : "payment_error"}`, 303);
  }
}

export const POST = handle;
export const GET = handle;
