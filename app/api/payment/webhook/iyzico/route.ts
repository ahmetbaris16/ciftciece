/**
 * POST /api/payment/webhook/iyzico — iyzico Üye İşyeri Bildirimi (webhook)
 *
 * iyzico panelinde tanımlanacak adres: https://<alan-adı>/api/payment/webhook/iyzico
 * (Ayarlar > Üye İşyeri Ayarları > Üye İşyeri Bildirimleri; X-IYZ-SIGNATURE-V3 açtırılmalı.)
 *
 * 1. Olay önce gelen kutusuna (payment_events) yazılır; (provider, eventKey) UNIQUE → tekrar gelen
 *    olay etkisizdir.
 * 2. Hemen 200 döner; işleme yanıttan sonra yapılır (after). İşleme bildirime güvenmez: token ile
 *    iyzico'dan sorgulanır ve sunucu tarafı doğrulama uygulanır (lib/payment/webhook/iyzico.ts).
 * 3. İmza doğrulanamazsa olay REJECTED kaydedilir, alarm üretilir, işlenmez; 401 döner (iyzico
 *    yeniden dener — anahtar yanlış ayarlanmışsa düzeltilince sonraki deneme kabul edilir).
 */

import { after, NextRequest, NextResponse } from "next/server";
import { USE_DB } from "@/lib/data/source";
import { iyzicoConfigFromEnv } from "@/lib/payment/providers/iyzico";
import {
  IYZICO_SIGNATURE_HEADER,
  MAX_WEBHOOK_BODY_BYTES,
  ingestIyzicoWebhook,
  processWebhookEvent,
} from "@/lib/payment/webhook/iyzico";
import { runNotifications } from "@/lib/notifications/run";

/** Yanıttan sonra işler; istek bağlamı dışında (test, betik) çağrılırsa hemen işler. */
async function processAfterResponse(eventId: string) {
  const work = async () => {
    try {
      const r = await processWebhookEvent(eventId);
      if (r.detail) console.info(`[webhook/iyzico] ${eventId}: ${r.outcome} (${r.detail})`);
      await runNotifications().catch((e) => console.error("[webhook/iyzico] bildirim:", e));
    } catch (err) {
      // Olay gelen kutusunda RECEIVED/FAILED kalır: elle sorgu ya da sonraki tetikleyici işler
      console.error("[webhook/iyzico] işleme hatası:", eventId, err);
    }
  };
  try {
    after(work);
  } catch {
    await work();
  }
}

export async function POST(request: NextRequest) {
  if (!USE_DB) return NextResponse.json({ error: "DB bağlantısı yok" }, { status: 503 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await ingestIyzicoWebhook(
      rawBody,
      request.headers.get(IYZICO_SIGNATURE_HEADER),
      iyzicoConfigFromEnv()?.secretKey ?? null
    );
    if (result.kind === "too_large") return NextResponse.json({ error: "too_large" }, { status: 413 });
    if (result.kind === "rejected") {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }
    if (result.needsProcessing) await processAfterResponse(result.eventId);
    return NextResponse.json({ received: true, duplicate: result.duplicate });
  } catch (err) {
    // Kayıt yazılamadı: 5xx → iyzico 15 dk sonra yeniden dener
    console.error("[webhook/iyzico] kayıt hatası:", err);
    return NextResponse.json({ error: "webhook_failed" }, { status: 500 });
  }
}
