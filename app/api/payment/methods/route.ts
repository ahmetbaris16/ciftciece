/**
 * GET /api/payment/methods — ödeme sayfasında gösterilecek yöntemler (kart / havale / kapıda ödeme).
 * Seçilebilenler `available: true`; kart sanal POS bağlanana kadar "yakında" olarak döner (seçilemez).
 * IBAN gibi ayrıntılar sipariş sonrası sayfada gösterilir.
 * Seçim sipariş anında /api/checkout'ta yeniden doğrulanır.
 */

import { NextResponse } from "next/server";
import { getPaymentSettings } from "@/lib/payment/settings.repository";
import { availablePaymentOptions } from "@/lib/payment/methods";
import { cardAvailabilityForRequest } from "@/lib/payment/availability";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const options = availablePaymentOptions(await getPaymentSettings(), await cardAvailabilityForRequest());
    return NextResponse.json({ options });
  } catch (err) {
    console.error("[/api/payment/methods]", err);
    return NextResponse.json({ error: "Ödeme seçenekleri yüklenemedi." }, { status: 503 });
  }
}
