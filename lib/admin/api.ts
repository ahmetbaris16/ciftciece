/**
 * Admin uç noktaları için ortak sarmalayıcı: köken denetimi, yönetici oturumu, gövde doğrulama, hata
 * dönüşümü (kurala aykırı işlem → anlaşılır mesaj), denetim kaydı.
 */

import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { requireAdminApi, type SessionUser } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/security/same-origin";
import { OrderTransitionError } from "@/lib/repositories/order.repository";
import { PaymentConfirmError } from "@/lib/payment/offline";
import { AdminActionError } from "./errors";

// Hata sınıfı ayrı dosyada: oturum/HTTP katmanını yüklemeden kütüphane kodu da fırlatabilsin
export { AdminActionError };

export async function adminAction<S extends z.ZodType>(
  request: NextRequest,
  schema: S,
  handler: (input: z.infer<S>, user: SessionUser) => Promise<unknown>
): Promise<NextResponse> {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz istek." }, { status: 400 });
  }
  try {
    const result = await handler(parsed.data, user);
    return NextResponse.json({ ok: true, result: result ?? null });
  } catch (err) {
    if (err instanceof OrderTransitionError || err instanceof PaymentConfirmError || err instanceof AdminActionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(`[admin] ${request.nextUrl.pathname}`, err);
    return NextResponse.json({ error: "İşlem yapılamadı. Lütfen tekrar deneyin." }, { status: 500 });
  }
}
