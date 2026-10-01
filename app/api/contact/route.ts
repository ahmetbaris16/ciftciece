/**
 * POST /api/contact — İletişim formu. Mesaj kaydedilir (admin → Mesajlar) ve işletmenin bildirim e-postasına
 * gider (yanıtla → müşteri). Müşteriye otomatik e-posta GÖNDERİLMEZ: form, başkası adına e-posta göndermek için
 * kötüye kullanılamasın. Kötüye kullanıma karşı: köken denetimi, IP başına sınır, görünmez tuzak alanı.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";
import { writeOutbox } from "@/lib/outbox";
import { scheduleNotifications } from "@/lib/notifications/run";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { isSameOrigin } from "@/lib/security/same-origin";
import { CONTACT_SUBJECTS } from "@/lib/contact/subjects";

const Schema = z.object({
  name: z.string().trim().min(2, { error: "Adınızı yazın." }).max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email({ error: "Geçerli bir e-posta adresi yazın." })),
  phone: z.string().trim().max(30).optional().default(""),
  subject: z.enum(CONTACT_SUBJECTS, { error: "Bir konu seçin." }),
  orderReference: z.string().trim().max(60).optional().default(""),
  message: z.string().trim().min(10, { error: "Mesajınız en az 10 karakter olmalı." }).max(4000),
  /** Görünmez alan: insan doldurmaz */
  website: z.string().optional().default(""),
});

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  if (!USE_DB) {
    return NextResponse.json(
      { error: "Mesaj şu anda gönderilemiyor. Lütfen telefon ya da WhatsApp'tan ulaşın." },
      { status: 503 }
    );
  }
  const ip = clientIp(request.headers);
  if (!rateLimit(`contact:${ip}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: "Çok fazla mesaj gönderildi. Lütfen daha sonra tekrar deneyin." }, { status: 429 });
  }
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: issue?.message ?? "Formu kontrol edin.", field: issue?.path?.[0] ?? null },
      { status: 400 }
    );
  }
  const input = parsed.data;
  // Tuzak alanı doluysa (otomatik gönderim) kaydetmeden "alındı" denir
  if (input.website) return NextResponse.json({ ok: true });

  try {
    await prisma.$transaction(async (tx) => {
      const msg = await tx.contactMessage.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone || null,
          subject: input.subject,
          message: input.message,
          orderReference: input.orderReference || null,
          ipAddress: ip.slice(0, 64),
        },
      });
      await writeOutbox(tx, {
        topic: "contact.received",
        aggregateType: "contact",
        aggregateId: msg.id,
        dedupeKey: `contact:${msg.id}`,
        payload: { messageId: msg.id },
      });
    });
    scheduleNotifications();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contact]", err);
    return NextResponse.json({ error: "Mesaj gönderilemedi. Lütfen telefonla ulaşın." }, { status: 500 });
  }
}
