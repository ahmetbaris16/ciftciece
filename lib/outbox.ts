/**
 * Outbox — dışarıya gidecek olayların kaydı (outbox_events).
 *
 * Olay, ilgili iş kaydıyla AYNI transaction'da yazılır: ya ikisi birden kalır ya hiçbiri.
 * Böylece "sipariş ödendi ama bildirim olayı kayboldu" (ya da tersi) olmaz. Gönderen işçi henüz yok
 * (Oturum 4/6); o zamana kadar satırlar publishedAt boş bekler.
 * dedupeKey UNIQUE: aynı olay ikinci kez yazılmaz (tekrar gelen doğrulama, eşzamanlı istek).
 * Kişisel veri yazılmaz: yalnız kimlikler, tutar, durum.
 */

import type { Prisma } from "@prisma/client";

export type OutboxTopic = "order.paid" | "payment.alert";

export interface OutboxInput {
  topic: OutboxTopic;
  aggregateType: "order" | "payment";
  aggregateId: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
}

/** Transaction içinde çağrılır. Yeni yazıldıysa true. */
export async function writeOutbox(tx: Prisma.TransactionClient, event: OutboxInput): Promise<boolean> {
  const { count } = await tx.outboxEvent.createMany({
    data: [
      {
        topic: event.topic,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        dedupeKey: event.dedupeKey,
        payload: event.payload as Prisma.InputJsonValue,
      },
    ],
    skipDuplicates: true,
  });
  return count === 1;
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
