/**
 * Sağlayıcısız ödemeler: havale/EFT onayı (admin) ve kapıda ödeme tahsilatı.
 * Kayıt kartla aynı modeldedir: ödeme denemesi SUCCEEDED olur (siparişte tek başarılı deneme
 * kuralı DB'de), olay payment_events'e yazılır, sipariş notuna yazılmaz.
 */

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { recordPaymentEvent } from "./events";
import { orderPaidEvent, writeOutbox } from "@/lib/outbox";

type Tx = Prisma.TransactionClient;

export class PaymentConfirmError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "PaymentConfirmError";
  }
}

/** Sağlayıcısız denemeyi başarılı yapar (eski siparişte deneme yoksa açar). Sipariş kilitli olmalı. */
async function succeedOfflineAttempt(
  tx: Tx,
  order: { id: string; totalKurus: number },
  provider: "havale" | "kapida",
  method: "BANK_TRANSFER" | "CASH_ON_DELIVERY"
) {
  const other = await tx.paymentAttempt.findFirst({ where: { orderId: order.id, status: "SUCCEEDED" }, select: { id: true } });
  if (other) throw new PaymentConfirmError("Bu siparişin başarılı bir ödeme kaydı zaten var.", 409);

  const existing = await tx.paymentAttempt.findFirst({
    where: { orderId: order.id, provider, status: { in: ["INITIATED", "EXPIRED"] } },
    orderBy: { createdAt: "desc" },
  });
  const attempt =
    existing ??
    (await tx.paymentAttempt.create({
      data: { orderId: order.id, provider, method, amountKurus: order.totalKurus, currency: "TRY" },
    }));
  await tx.paymentAttempt.update({
    where: { id: attempt.id },
    data: {
      status: "SUCCEEDED",
      successOrderId: order.id,
      paidAmountKurus: attempt.amountKurus,
      paidCurrency: attempt.currency,
      verifiedAt: new Date(),
      failureReason: null,
    },
  });
  // Eski düzende açılmış ödeme satırı varsa kapatılır (yeni siparişlerde yok)
  await tx.payment.updateMany({ where: { orderId: order.id, status: "PENDING" }, data: { status: "SUCCESS" } });
  return attempt;
}

/**
 * Admin "Havale ödemesi alındı": PENDING → PAID. Tutarı admin teyit eder (ekranda sorulur).
 * Kartla ödenen sipariş bu yoldan "ödendi" yapılamaz.
 */
export async function confirmBankTransferPayment(orderId: string, actorId: string): Promise<{ reference: string }> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; reference: string; status: string; paymentMethod: string; totalKurus: number }>>`
        SELECT \`id\`, \`reference\`, \`status\`, \`paymentMethod\`, \`totalKurus\`
        FROM \`orders\` WHERE \`id\` = ${orderId} FOR UPDATE`;
      const order = rows[0];
      if (!order) throw new PaymentConfirmError("Sipariş bulunamadı", 404);
      if (order.paymentMethod !== "BANK_TRANSFER") {
        throw new PaymentConfirmError(
          order.paymentMethod === "CARD"
            ? "Kart ödemesi elle onaylanamaz; ödeme sağlayıcısının onayı beklenir."
            : "Bu sipariş havale/EFT ile ödenmiyor."
        );
      }
      if (order.status !== "PENDING") {
        throw new PaymentConfirmError("Yalnız ödeme bekleyen havale siparişi onaylanabilir.", 409);
      }

      const attempt = await succeedOfflineAttempt(tx, order, "havale", "BANK_TRANSFER");
      const { count } = await tx.order.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "PAID" } });
      if (count !== 1) throw new PaymentConfirmError("Sipariş durumu bu sırada değişti, sayfayı yenileyin.", 409);

      await recordPaymentEvent(tx, {
        source: "ADMIN",
        eventType: "bank_transfer.confirmed",
        provider: "havale",
        orderId: order.id,
        attemptId: attempt.id,
        actorId,
        outcome: "paid",
        payload: { amountKurus: attempt.amountKurus },
      });
      await writeOutbox(
        tx,
        orderPaidEvent({ ...order, paymentMethod: "BANK_TRANSFER", attemptId: attempt.id, outcome: "paid" })
      );
      return { reference: order.reference };
    },
    { timeout: 15_000 }
  );
}

/** Kapıda ödeme: sipariş teslim edildiğinde tahsilat yapılmıştır. updateOrderStatus transaction'ı içinde. */
export async function recordCashOnDeliveryCollected(
  tx: Tx,
  order: { id: string; reference: string; totalKurus: number },
  actorId: string | null
) {
  const attempt = await succeedOfflineAttempt(tx, order, "kapida", "CASH_ON_DELIVERY");
  await writeOutbox(
    tx,
    orderPaidEvent({ ...order, paymentMethod: "CASH_ON_DELIVERY", attemptId: attempt.id, outcome: "collected_on_delivery" })
  );
  await recordPaymentEvent(tx, {
    source: "ADMIN",
    eventType: "cash_on_delivery.collected",
    provider: "kapida",
    orderId: order.id,
    attemptId: attempt.id,
    actorId,
    outcome: "paid",
    payload: { amountKurus: attempt.amountKurus },
  });
}
