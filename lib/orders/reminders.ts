/**
 * Havale/EFT hatırlatması: son ödeme zamanına 12 saatten az kalmış, ödenmemiş havale siparişi için müşteriye bir
 * kez hatırlatma e-postası (outbox → e-posta; tekrar anahtarlı, ikinci kez yazılmaz). Ödeme süresi değişmez.
 * Kısa süreli siparişlerde (6 saatten yeni) hatırlatma gönderilmez: müşteri talimatı zaten yeni aldı.
 */

import { prisma } from "@/lib/db/prisma";
import { writeOutbox } from "@/lib/outbox";

export const REMINDER_BEFORE_MS = 12 * 3_600_000;
const MIN_ORDER_AGE_MS = 6 * 3_600_000;

export async function enqueueTransferReminders(now = new Date()): Promise<number> {
  const orders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      paymentMethod: "BANK_TRANSFER",
      needsAttention: false,
      paymentDueAt: { gt: now, lte: new Date(now.getTime() + REMINDER_BEFORE_MS) },
      createdAt: { lte: new Date(now.getTime() - MIN_ORDER_AGE_MS) },
    },
    select: { id: true, reference: true, paymentDueAt: true },
    take: 50,
  });
  let written = 0;
  for (const o of orders) {
    const created = await prisma.$transaction((tx) =>
      writeOutbox(tx, {
        topic: "order.payment_reminder",
        aggregateType: "order",
        aggregateId: o.id,
        dedupeKey: `order.reminder:${o.id}`,
        payload: { orderId: o.id, reference: o.reference, paymentDueAt: o.paymentDueAt?.toISOString() ?? null },
      })
    );
    if (created) written++;
  }
  return written;
}
