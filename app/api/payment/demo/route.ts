/**
 * POST /api/payment/demo — demo banka sayfasının işlemleri (/demo-odeme/<deneme>).
 *
 *  { action: "send-code",   attemptId }        → 6 haneli kod (demo: yanıtta döner, sayfada SMS olarak gösterilir)
 *  { action: "verify-code", attemptId, code }  → doğruysa onay, 3 yanlışta ret; yanıtta dönüş adresi
 *  { action: "cancel",      attemptId }        → ret (müşteri vazgeçti)
 *
 * Kart bilgisi bu uca hiç gönderilmez. Onay/ret siparişi tek başına değiştirmez: tarayıcı dönüş adresine
 * (/api/payment/verify) gider, sonuç orada sunucudan sorgulanıp doğrulanır. Kurallar: lib/payment/demo.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { USE_DB } from "@/lib/data/source";
import { isSameOrigin } from "@/lib/security/same-origin";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { cancelDemoPayment, sendDemoCode, verifyDemoCode } from "@/lib/payment/demo";

const attemptId = z.string().min(1).max(64);
const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send-code"), attemptId }),
  z.object({ action: z.literal("verify-code"), attemptId, code: z.string().regex(/^\d{6}$/, "Kod 6 haneli olmalı.") }),
  z.object({ action: z.literal("cancel"), attemptId }),
]);

export async function POST(request: NextRequest) {
  if (!USE_DB) return NextResponse.json({ error: "Veritabanı bağlı değil." }, { status: 503 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  if (!rateLimit(`demo-pay:${clientIp(request.headers)}`, 60, 10 * 60_000)) {
    return NextResponse.json({ error: "Çok fazla istek. Biraz sonra tekrar deneyin." }, { status: 429 });
  }

  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz istek." }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const result =
      input.action === "send-code"
        ? await sendDemoCode(input.attemptId)
        : input.action === "verify-code"
          ? await verifyDemoCode(input.attemptId, input.code)
          : await cancelDemoPayment(input.attemptId);
    if (!result.ok) {
      const { httpStatus, ...body } = result;
      return NextResponse.json(body, { status: httpStatus });
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[payment/demo]", err);
    return NextResponse.json({ error: "İşlem yapılamadı. Lütfen tekrar deneyin." }, { status: 500 });
  }
}
