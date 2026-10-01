/**
 * Kuyruktaki e-postaları gönderir (SMTP). Sipariş kaydından bağımsızdır: gönderilemeyen e-posta siparişi
 * etkilemez, kuyrukta kalır ve yeniden denenir.
 *
 * Eşzamanlılık: bir satır koşullu güncellemeyle "alınır" (QUEUED → SENDING); aynı anda çalışan ikinci süreç
 * aynı e-postayı alamaz. Süreç gönderim sırasında çökerse satır lockedUntil sonunda yeniden kuyruğa döner:
 * e-posta kaybolmaz, en kötü durumda iki kez gider ("en az bir kez").
 *
 * Yeniden deneme: 1 dk, 5 dk, 15 dk, 1 sa, 4 sa, 12 sa (6 deneme). Kalıcı hata (adres yok, reddedildi)
 * hemen FAILED olur. Admin panelinden yeniden kuyruğa alınabilir.
 */

import { prisma } from "@/lib/db/prisma";
import { emailMode } from "@/lib/email/config";
import { deliver, EmailNotConfiguredError, maskEmail, PermanentEmailError } from "@/lib/email/transport";

export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 4 * 60 * 60_000, 12 * 60 * 60_000];
export const MAX_EMAIL_ATTEMPTS = RETRY_DELAYS_MS.length;
const LOCK_MS = 2 * 60_000;

export interface SendResult {
  sent: number;
  failed: number;
  retried: number;
  notConfigured: boolean;
}

export async function sendDueEmails(opts: { limit?: number; now?: Date } = {}): Promise<SendResult> {
  const result: SendResult = { sent: 0, failed: 0, retried: 0, notConfigured: false };
  if (emailMode() === "none") {
    result.notConfigured = true;
    return result;
  }
  const now = opts.now ?? new Date();

  // Yarıda kalmış gönderimler (süreç çöktü) kuyruğa döner
  await prisma.emailMessage.updateMany({
    where: { status: "SENDING", lockedUntil: { lt: now } },
    data: { status: "QUEUED", lockedUntil: null },
  });
  // Süresi geçmiş e-postalar (ör. son ödeme zamanı geçmiş hatırlatma) gönderilmez
  await prisma.emailMessage.updateMany({
    where: { status: "QUEUED", expiresAt: { lt: now } },
    data: { status: "CANCELLED", lastError: "Süresi geçtiği için gönderilmedi." },
  });

  const due = await prisma.emailMessage.findMany({
    where: { status: "QUEUED", availableAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? 20,
    select: { id: true },
  });

  for (const { id } of due) {
    const claimed = await prisma.emailMessage.updateMany({
      where: { id, status: "QUEUED" },
      data: { status: "SENDING", lockedUntil: new Date(Date.now() + LOCK_MS), attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) continue; // başka süreç aldı
    const msg = await prisma.emailMessage.findUniqueOrThrow({ where: { id } });

    try {
      const delivery = await deliver({
        to: msg.toAddress,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        replyTo: msg.replyTo,
      });
      await prisma.emailMessage.update({
        where: { id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          lockedUntil: null,
          lastError: delivery.mode === "dev-outbox" ? "Geliştirme: gönderilmedi, .mock-data/outbox.json'a yazıldı." : null,
          providerMessageId: delivery.messageId?.slice(0, 300) ?? null,
        },
      });
      result.sent++;
    } catch (err) {
      if (err instanceof EmailNotConfiguredError) {
        // Ayar bu sırada kalktı: deneme sayılmaz, beklemeye devam
        await prisma.emailMessage.update({
          where: { id },
          data: { status: "QUEUED", lockedUntil: null, attempts: { decrement: 1 } },
        });
        result.notConfigured = true;
        break;
      }
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
      const permanent = err instanceof PermanentEmailError;
      if (permanent || msg.attempts >= MAX_EMAIL_ATTEMPTS) {
        await prisma.emailMessage.update({
          where: { id },
          data: { status: "FAILED", lockedUntil: null, lastError: message },
        });
        result.failed++;
        console.error(`[email] gönderilemedi (${msg.kind} → ${maskEmail(msg.toAddress)}): ${message}`);
      } else {
        const delay = RETRY_DELAYS_MS[Math.min(msg.attempts - 1, RETRY_DELAYS_MS.length - 1)];
        await prisma.emailMessage.update({
          where: { id },
          data: { status: "QUEUED", lockedUntil: null, lastError: message, availableAt: new Date(Date.now() + delay) },
        });
        result.retried++;
        console.warn(`[email] geçici hata, yeniden denenecek (${msg.kind}): ${message}`);
      }
    }
  }
  return result;
}

/** Admin: başarısız/iptal e-postayı yeniden kuyruğa alır (deneme sayacı sıfırlanır) */
export async function requeueEmail(id: string): Promise<boolean> {
  const { count } = await prisma.emailMessage.updateMany({
    where: { id, status: { in: ["FAILED", "CANCELLED"] } },
    data: { status: "QUEUED", attempts: 0, availableAt: new Date(), lastError: null, expiresAt: null },
  });
  return count === 1;
}
