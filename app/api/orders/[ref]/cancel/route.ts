/**
 * POST /api/orders/[ref]/cancel — müşteri ödenmemiş siparişini iptal eder (stok geri döner).
 * Sipariş numarası (tahmin edilemez referans) sipariş sayfasının da anahtarıdır.
 */

import { NextRequest, NextResponse } from "next/server";
import { cancelByCustomer } from "@/lib/orders/lifecycle";
import { OrderTransitionError } from "@/lib/repositories/order.repository";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { isSameOrigin } from "@/lib/security/same-origin";
import { scheduleNotifications } from "@/lib/notifications/run";
import { USE_DB } from "@/lib/data/source";

export async function POST(request: NextRequest, context: { params: Promise<{ ref: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  if (!USE_DB) return NextResponse.json({ error: "Şu anda işlem yapılamıyor." }, { status: 503 });
  if (!rateLimit(`order-cancel:${clientIp(request.headers)}`, 10, 15 * 60_000)) {
    return NextResponse.json({ error: "Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin." }, { status: 429 });
  }
  const { ref } = await context.params;
  try {
    await cancelByCustomer(ref);
    scheduleNotifications();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof OrderTransitionError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[orders/cancel]", err);
    return NextResponse.json({ error: "İptal edilemedi. Lütfen bizi arayın." }, { status: 500 });
  }
}
