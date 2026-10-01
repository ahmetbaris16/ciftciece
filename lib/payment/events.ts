/**
 * Ödeme olayları — yalnız eklenen kayıt (payment_events). Sipariş notunun yerini alır:
 * tarayıcı dönüşü, sağlayıcı sorgusu, webhook, admin işlemi ve otomatik işlerin her biri ayrı satırdır.
 */

import { randomUUID } from "node:crypto";
import type { PaymentEventSource, PaymentEventStatus, Prisma } from "@prisma/client";

export interface RecordEventInput {
  source: PaymentEventSource;
  /** Örn. "verify.success", "attempt.expired", "bank_transfer.confirmed" */
  eventType: string;
  /** Olayın ait olduğu sağlayıcı ("iyzico", "havale"...). Yoksa "internal". */
  provider?: string | null;
  /** Tekrar koruması gereken olaylarda belirlenimci anahtar; yoksa rastgele */
  eventKey?: string;
  orderId?: string | null;
  attemptId?: string | null;
  actorId?: string | null;
  outcome?: string | null;
  payload?: Record<string, unknown>;
  status?: PaymentEventStatus;
  error?: string | null;
}

export async function recordPaymentEvent(tx: Prisma.TransactionClient, e: RecordEventInput): Promise<{ id: string }> {
  return tx.paymentEvent.create({
    data: {
      provider: e.provider ?? "internal",
      eventKey: e.eventKey ?? `${e.source.toLowerCase()}:${randomUUID()}`,
      source: e.source,
      eventType: e.eventType,
      payload: (e.payload ?? {}) as Prisma.InputJsonValue,
      status: e.status ?? "RECORDED",
      orderId: e.orderId ?? null,
      attemptId: e.attemptId ?? null,
      actorId: e.actorId ?? null,
      outcome: e.outcome ?? null,
      error: e.error ? e.error.slice(0, 1000) : null,
      handledAt: new Date(),
    },
    select: { id: true },
  });
}
