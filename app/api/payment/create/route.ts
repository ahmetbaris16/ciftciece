/**
 * POST /api/payment/create
 *
 * Sipariş ID ile KART ödemesini başlatır (havale ve kapıda ödeme bu adımı kullanmaz).
 * Her çağrı yeni bir ödeme denemesi açar (payment_attempts); önceki deneme ezilmez. Açık bir deneme
 * zaten ödenmişse yeni form açılmaz (lib/payment/card.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CHECKOUT_MESSAGES } from "@/lib/validation/checkout";
import { clientIp } from "@/lib/security/rate-limit";
import { startCardPayment } from "@/lib/payment/card";

const USE_DB = !!process.env.DATABASE_URL;

const Schema = z.object({
  orderId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  if (!USE_DB) {
    return NextResponse.json({ error: CHECKOUT_MESSAGES.serviceUnavailable }, { status: 503 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: CHECKOUT_MESSAGES.paymentFailed }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: CHECKOUT_MESSAGES.paymentFailed }, { status: 400 });
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const result = await startCardPayment(parsed.data.orderId, { appUrl, buyerIp: clientIp(request.headers) });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code, reference: result.reference },
        { status: result.status }
      );
    }
    return NextResponse.json({ redirectUrl: result.redirectUrl, checkoutFormHtml: result.checkoutFormHtml });
  } catch (err) {
    console.error("[payment/create]", err);
    return NextResponse.json({ error: CHECKOUT_MESSAGES.paymentFailed }, { status: 500 });
  }
}
