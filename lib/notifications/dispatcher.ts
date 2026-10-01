/**
 * Outbox dağıtıcısı: işlemle birlikte yazılmış olayları (outbox_events) e-postalara çevirir.
 *
 * Olay → kurallar (rules.ts) → e-posta taslakları → kuyruk (email_messages) + olay "yayınlandı".
 * Kuyruğa ekleme ve olayın kapanması aynı işlemdedir. E-postalar tekrar anahtarlıdır
 * (`<olay anahtarı>:<şablon>`), bu yüzden aynı olay iki süreçte aynı anda işlenirse de e-posta bir kez oluşur.
 *
 * Kural hata verirse olay açık kalır: 1, 5, 30 dk, 2 sa, 12 sa sonra yeniden denenir (5 deneme), hata metni
 * olayda saklanır ve admin panelinde görünür.
 */

import type { OutboxEvent } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { enqueueEmail, type EmailDraft } from "./queue";
import { draftsForEvent } from "./rules";

const EVENT_RETRY_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];
export const MAX_EVENT_ATTEMPTS = EVENT_RETRY_MS.length;

export interface DispatchResult {
  processed: number;
  emails: number;
  failed: number;
}

export async function processOutbox(opts: { limit?: number; now?: Date } = {}): Promise<DispatchResult> {
  const now = opts.now ?? new Date();
  const result: DispatchResult = { processed: 0, emails: 0, failed: 0 };
  // availableAt varsayılanı veritabanı sürücüsünün saatiyle yazılır ve milisaniyeye yuvarlanır; hemen ardından
  // çalışan döngü olayı "gelecekte" görmesin diye 1 sn pay (yeniden deneme gecikmeleri dakikalarca)
  const due = new Date(now.getTime() + 1000);
  const events = await prisma.outboxEvent.findMany({
    where: { publishedAt: null, availableAt: { lte: due }, attempts: { lt: MAX_EVENT_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? 25,
  });

  for (const event of events) {
    try {
      const drafts: EmailDraft[] = await draftsForEvent(event);
      const created = await prisma.$transaction(async (tx) => {
        let n = 0;
        for (const draft of drafts) {
          if (await enqueueEmail(tx, { ...draft, dedupeKey: `${event.dedupeKey}:${draft.dedupeKey}` })) n++;
        }
        await tx.outboxEvent.updateMany({
          where: { id: event.id, publishedAt: null },
          data: { publishedAt: new Date(), lastError: null },
        });
        return n;
      });
      result.processed++;
      result.emails += created;
    } catch (err) {
      result.failed++;
      await recordFailure(event, err);
    }
  }
  return result;
}

async function recordFailure(event: OutboxEvent, err: unknown) {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
  const delay = EVENT_RETRY_MS[Math.min(event.attempts, EVENT_RETRY_MS.length - 1)];
  console.error(`[outbox] ${event.topic} (${event.id}) işlenemedi: ${message}`);
  await prisma.outboxEvent
    .update({
      where: { id: event.id },
      data: { attempts: { increment: 1 }, lastError: message, availableAt: new Date(Date.now() + delay) },
    })
    .catch((e) => console.error("[outbox] hata kaydı yazılamadı:", e));
}
