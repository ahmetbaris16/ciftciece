/**
 * POST /api/orders/[ref]/request { type: CANCEL | RETURN, message } — müşteri talebi:
 * ödenmiş/hazırlanan siparişte iptal isteği, kargolanmış/teslim edilmiş siparişte cayma (iade) bildirimi.
 * Talep kaydedilir, işletmeye e-posta gider, sipariş sayfasında görünür.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCustomerRequest } from "@/lib/orders/lifecycle";
import { OrderTransitionError } from "@/lib/repositories/order.repository";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { isSameOrigin } from "@/lib/security/same-origin";
import { scheduleNotifications } from "@/lib/notifications/run";
import { USE_DB } from "@/lib/data/source";

const Schema = z.object({
  type: z.enum(["CANCEL", "RETURN"]),
  message: z.string().trim().max(2000).default(""),
});

export async function POST(request: NextRequest, context: { params: Promise<{ ref: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  if (!USE_DB) return NextResponse.json({ error: "Şu anda işlem yapılamıyor." }, { status: 503 });
  const ip = clientIp(request.headers);
  if (!rateLimit(`order-request:${ip}`, 6, 15 * 60_000)) {
    return NextResponse.json({ error: "Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin." }, { status: 429 });
  }
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });

  const { ref } = await context.params;
  try {
    const { created } = await createCustomerRequest(ref, { ...parsed.data, ipAddress: ip });
    if (created) scheduleNotifications();
    return NextResponse.json({ ok: true, created });
  } catch (err) {
    if (err instanceof OrderTransitionError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[orders/request]", err);
    return NextResponse.json({ error: "Gönderilemedi. Lütfen bizi arayın." }, { status: 500 });
  }
}
