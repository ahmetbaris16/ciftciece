/**
 * GET /api/payment/methods — ödeme sayfasında gösterilecek yöntemler (kart / havale / kapıda ödeme).
 * Yalnız gerçekten kullanılabilir olanlar döner; IBAN gibi ayrıntılar sipariş sonrası sayfada gösterilir.
 * Seçim sipariş anında /api/checkout'ta yeniden doğrulanır.
 */

import { NextResponse } from "next/server";
import { getPaymentSettings } from "@/lib/payment/settings.repository";
import { availablePaymentOptions } from "@/lib/payment/methods";
import { isCardPaymentReady } from "@/lib/payment/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const options = availablePaymentOptions(await getPaymentSettings(), isCardPaymentReady());
    return NextResponse.json({ options });
  } catch (err) {
    console.error("[/api/payment/methods]", err);
    return NextResponse.json({ error: "Ödeme seçenekleri yüklenemedi." }, { status: 503 });
  }
}
