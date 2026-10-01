/**
 * GET /api/shipping — müşteri tarafı kargo özeti: kargo firması (Yurtiçi Kargo) ve ücretsiz kargo eşiği.
 * Sepete göre ücret: POST /api/shipping/quote. Sipariş tutarı her zaman sunucuda yeniden hesaplanır.
 */

import { NextResponse } from "next/server";
import { getShippingSettings } from "@/lib/shipping/shipping.repository";
import { toPublicShippingInfo } from "@/lib/shipping/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(toPublicShippingInfo(await getShippingSettings()));
  } catch (err) {
    console.error("[/api/shipping]", err);
    return NextResponse.json(
      { error: "Kargo bilgileri yüklenemedi. Lütfen sayfayı yenileyin." },
      { status: 503 }
    );
  }
}
