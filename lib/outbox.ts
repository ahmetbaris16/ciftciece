/**
 * Outbox — dışarıya gidecek olayların kaydı (outbox_events).
 *
 * Olay, ilgili iş kaydıyla AYNI transaction'da yazılır: ya ikisi birden kalır ya hiçbiri.
 * Böylece "sipariş ödendi ama bildirim olayı kayboldu" (ya da tersi) olmaz. Dağıtıcı
 * (lib/notifications/dispatcher.ts) olayları e-postaya çevirir ve publishedAt'i doldurur.
 * dedupeKey UNIQUE: aynı olay ikinci kez yazılmaz (tekrar gelen doğrulama, eşzamanlı istek).
 * Kişisel veri yazılmaz: yalnız kimlikler, tutar, durum.
 */

import { Prisma } from "@prisma/client";

export type OutboxTopic =
  | "order.placed" // sipariş oluşturuldu (her yöntem)
  | "order.paid" // ödeme alındı (kart, havale, kapıda ödeme)
  | "order.status_changed" // hazırlanıyor, teslim, iptal, iade
  | "order.shipped" // kargo gönderisi eklendi (takip numarasıyla)
  | "order.refunded" // iade kaydı girildi
  | "order.customer_request" // müşteri iptal/iade talebi
  | "order.payment_reminder" // havale son ödeme hatırlatması
  | "payment.alert" // ödeme uyarısı (insan kararı)
  | "contact.received" // iletişim formu mesajı
  | "review.submitted"; // onay bekleyen ürün değerlendirmesi

export interface OutboxInput {
  topic: OutboxTopic;
  aggregateType: "order" | "payment" | "contact" | "review";
  aggregateId: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
}

/**
 * Transaction içinde çağrılır. Yeni yazıldıysa true.
 * createMany({ skipDuplicates }) kullanılmaz: MySQL'de INSERT IGNORE olur ve tekrar dışındaki hataları da
 * sessizce yutar. Önce bakılır; eşzamanlı yazımda UNIQUE ihlali (P2002) "zaten var" demektir.
 */
export async function writeOutbox(tx: Prisma.TransactionClient, event: OutboxInput): Promise<boolean> {
  const existing = await tx.outboxEvent.findUnique({ where: { dedupeKey: event.dedupeKey }, select: { id: true } });
  if (existing) return false;
  try {
    await tx.outboxEvent.create({
      data: {
        topic: event.topic,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        dedupeKey: event.dedupeKey,
        payload: event.payload as Prisma.InputJsonValue,
      },
    });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
}

/** "Sipariş ödendi" olayı (kart, havale, kapıda ödeme) */
export function orderPaidEvent(order: {
  id: string;
  reference: string;
  totalKurus: number;
  paymentMethod: string;
  attemptId: string;
  outcome: string;
}): OutboxInput {
  return {
    topic: "order.paid",
    aggregateType: "order",
    aggregateId: order.id,
    dedupeKey: `order.paid:${order.id}`,
    payload: {
      orderId: order.id,
      reference: order.reference,
      totalKurus: order.totalKurus,
      paymentMethod: order.paymentMethod,
      attemptId: order.attemptId,
      outcome: order.outcome,
    },
  };
}
