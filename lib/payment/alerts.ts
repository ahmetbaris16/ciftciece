/**
 * Ödeme alarmları — insan kararı gereken durumların kalıcı kaydı (payment_alerts).
 *
 * Alarm, siparişi NEEDS_ATTENTION yapar (orders.needsAttention): işaretli sipariş otomatik iptal
 * edilmez, admin panelinde öne çıkar. Para hareketi (iade vb.) otomatiğe bağlanmaz.
 * Bildirim kanalı (e-posta/Telegram) ayrı karar ve ayrı oturum; şimdilik kayıt + sunucu logu.
 */

import type { Prisma } from "@prisma/client";
import { writeOutbox } from "@/lib/outbox";

export type PaymentAlertKind =
  | "PAYMENT_MISMATCH"
  | "DUPLICATE_PAYMENT"
  | "LATE_PAYMENT"
  | "LATE_PAYMENT_NO_STOCK"
  | "PAYMENT_ON_CLOSED_ORDER"
  | "FRAUD_REVIEW"
  | "WEBHOOK_SIGNATURE_INVALID";

export const ALERT_TITLES: Record<PaymentAlertKind, string> = {
  PAYMENT_MISMATCH: "Ödeme doğrulaması tutmadı",
  DUPLICATE_PAYMENT: "Çift ödeme — iade gerekir",
  LATE_PAYMENT: "Geç ödeme — sipariş yeniden açıldı",
  LATE_PAYMENT_NO_STOCK: "Geç ödeme — stok yok, iade önerilir",
  PAYMENT_ON_CLOSED_ORDER: "Kapanmış siparişe ödeme geldi",
  FRAUD_REVIEW: "iyzico ödemeyi incelemeye aldı",
  WEBHOOK_SIGNATURE_INVALID: "İmzası doğrulanamayan ödeme bildirimi",
};

export interface RaiseAlertInput {
  kind: PaymentAlertKind;
  /** Aynı durum için ikinci alarm üretilmez (UNIQUE) */
  dedupeKey: string;
  /** Admin'e gösterilen kısa Türkçe açıklama — kişisel veri yazılmaz */
  message: string;
  orderId?: string | null;
  attemptId?: string | null;
  eventId?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Alarm yazar ve siparişi NEEDS_ATTENTION yapar. Ödeme kaydıyla AYNI transaction içinde çağrılır.
 * Dönen değer: yeni alarm yazıldıysa true (daha önce yazılmışsa false).
 */
export async function raiseAlert(tx: Prisma.TransactionClient, alert: RaiseAlertInput): Promise<boolean> {
  const { count } = await tx.paymentAlert.createMany({
    data: [
      {
        kind: alert.kind,
        dedupeKey: alert.dedupeKey,
        message: alert.message,
        orderId: alert.orderId ?? null,
        attemptId: alert.attemptId ?? null,
        eventId: alert.eventId ?? null,
        details: (alert.details ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    ],
    skipDuplicates: true,
  });
  if (alert.orderId) {
    await tx.order.update({ where: { id: alert.orderId }, data: { needsAttention: true } });
  }
  if (count === 1) {
    // Alarm kanalı (Oturum 6) bu olayı gönderecek; şimdilik aynı transaction'da kayda geçer
    await writeOutbox(tx, {
      topic: "payment.alert",
      aggregateType: alert.orderId ? "order" : "payment",
      aggregateId: alert.orderId ?? alert.eventId ?? alert.dedupeKey,
      dedupeKey: `payment.alert:${alert.dedupeKey}`,
      payload: { kind: alert.kind, message: alert.message, orderId: alert.orderId ?? null, attemptId: alert.attemptId ?? null },
    });
  }
  return count === 1;
}

/** Alarm logu — transaction başarıyla bittikten sonra çağrılır. */
export function logAlert(kind: PaymentAlertKind, ref: string, message: string) {
  console.error(`[ödeme-alarm] ${kind} ${ref}: ${message}`);
}
