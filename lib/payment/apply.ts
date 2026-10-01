/**
 * Doğrulanmış sağlayıcı sonucunun kaydı — tx2.
 *
 * Tek transaction'da: sipariş satırı kilitlenir (SELECT … FOR UPDATE), sonra deneme; deneme durumu,
 * sipariş durumu, stok (geç ödemede), alarm ve ödeme olayı birlikte yazılır ya da hiçbiri yazılmaz.
 * Dış HTTP çağrısı burada YAPILMAZ (sonuç verify.ts'den gelir).
 *
 * Kurallar (geri alınmaz, sıra dışı olaylar durumu geri çevirmez):
 *  - SUCCEEDED / MISMATCH / DUPLICATE sonuçlanmış denemedir; otomatik olarak değişmez.
 *  - Sipariş yalnız PENDING → PAID (ya da geç ödemede CANCELLED → PAID) yönünde ilerler.
 *  - Siparişte zaten başarılı ödeme varsa yeni doğrulanmış ödeme DUPLICATE olur (+ alarm, iade gerekir).
 *  - Tutar/kimlik uyuşmazlığında sipariş PAID yapılmaz: deneme MISMATCH + alarm + NEEDS_ATTENTION.
 *  - Geç ödeme (sipariş süre dolup iptal edilmişken): otomatik iade YOK, sessiz yeniden açma YOK.
 *    Stok varsa sipariş yeniden açılır (PAID) ama NEEDS_ATTENTION; stok yoksa CANCELLED kalır,
 *    NEEDS_ATTENTION + iade önerisi. Para hareketi otomatiğe bağlanmaz.
 */

import { prisma } from "@/lib/db/prisma";
import type { OrderStatus, PaymentAttemptStatus, PaymentEventSource, Prisma } from "@prisma/client";
import { formatPrice } from "@/types";
import { raiseAlert, logAlert, type PaymentAlertKind } from "./alerts";
import { recordPaymentEvent } from "./events";
import type { Classification, ProviderPaymentData } from "./verify";

export type ApplyOutcome =
  | "paid" // sipariş PENDING → PAID
  | "already_paid" // bu deneme zaten başarılı kaydedilmiş
  | "late_reopened" // iptal edilmiş siparişe ödeme, stok vardı → PAID + NEEDS_ATTENTION
  | "late_no_stock" // iptal edilmiş siparişe ödeme, stok yok → CANCELLED + NEEDS_ATTENTION (iade önerisi)
  | "duplicate" // siparişin başka başarılı ödemesi var → iade gerekir
  | "closed_order" // beklenmeyen durumdaki siparişe ödeme → NEEDS_ATTENTION
  | "mismatch" // doğrulama tutmadı → PAID yapılmadı
  | "failed" // ödeme yok
  | "pending"; // sağlayıcıda ara durum / bilinmiyor

export interface ApplyInput {
  attemptId: string;
  classification: Classification;
  source: PaymentEventSource;
  actorId?: string | null;
  /** Gelen kutusundaki webhook olayı işleniyorsa: o satır güncellenir, yeni olay satırı açılmaz */
  inboxEventId?: string | null;
}

export interface ApplyResult {
  outcome: ApplyOutcome;
  orderId: string;
  orderReference: string;
  orderStatus: OrderStatus;
  attemptStatus: PaymentAttemptStatus;
  /** Bu çağrıda yeni yazılan alarmlar */
  alerts: Array<{ kind: PaymentAlertKind; message: string }>;
}

type Tx = Prisma.TransactionClient;

const TERMINAL_OUTCOME: Partial<Record<PaymentAttemptStatus, ApplyOutcome>> = {
  SUCCEEDED: "already_paid",
  MISMATCH: "mismatch",
  DUPLICATE: "duplicate",
};

function providerFields(data: ProviderPaymentData) {
  return {
    ...(data.paymentId ? { providerPaymentId: data.paymentId } : {}),
    paidAmountKurus: data.paidAmountKurus,
    chargedAmountKurus: data.chargedAmountKurus,
    paidCurrency: data.currency ?? null,
    installment: data.installment ?? null,
    fraudStatus: data.fraudStatus ?? null,
    verifiedAt: new Date(),
  };
}

/** Siparişi ve denemeyi bu sırayla kilitler (tüm ödeme yolları aynı sırayı kullanır). */
async function lockOrderAndAttempt(tx: Tx, attemptId: string) {
  const orders = await tx.$queryRaw<Array<{ id: string; reference: string; status: OrderStatus; totalKurus: number }>>`
    SELECT o.id, o.reference, o.status::text AS status, o."totalKurus"
    FROM orders o
    WHERE o.id = (SELECT a."orderId" FROM payment_attempts a WHERE a.id = ${attemptId})
    FOR UPDATE`;
  const order = orders[0];
  if (!order) throw new Error(`Ödeme denemesi bulunamadı: ${attemptId}`);
  const attempts = await tx.$queryRaw<Array<{ id: string; status: PaymentAttemptStatus; provider: string }>>`
    SELECT id, status::text AS status, provider FROM payment_attempts WHERE id = ${attemptId} FOR UPDATE`;
  return { order, attempt: attempts[0] };
}

/**
 * İptal edilmiş siparişin stoğunu yeniden ayırmayı dener: hepsi ya da hiçbiri.
 * Stok satırları variantId sırasıyla kilitlenir (kilit sırası her yerde aynı → deadlock yok).
 */
async function tryReserveStockAgain(tx: Tx, orderId: string): Promise<boolean> {
  const items = await tx.orderItem.findMany({ where: { orderId }, select: { variantId: true, quantity: true } });
  const need = new Map<string, number>();
  for (const item of items) need.set(item.variantId, (need.get(item.variantId) ?? 0) + item.quantity);
  const variantIds = [...need.keys()].sort();
  if (variantIds.length === 0) return true;

  const rows = await tx.$queryRaw<Array<{ variantId: string; quantity: number }>>`
    SELECT "variantId", quantity FROM inventory
    WHERE "variantId" = ANY(${variantIds}::text[])
    ORDER BY "variantId"
    FOR UPDATE`;
  const available = new Map(rows.map((r) => [r.variantId, r.quantity]));
  if (variantIds.some((id) => (available.get(id) ?? 0) < (need.get(id) ?? 0))) return false;

  for (const variantId of variantIds) {
    const quantity = need.get(variantId) ?? 0;
    const { count } = await tx.inventory.updateMany({
      where: { variantId, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (count !== 1) throw new Error(`Stok yeniden ayrılamadı: ${variantId}`);
  }
  return true;
}

export async function applyProviderResult(input: ApplyInput): Promise<ApplyResult> {
  const { classification: c } = input;

  const result = await prisma.$transaction(
    async (tx) => {
      const { order, attempt } = await lockOrderAndAttempt(tx, input.attemptId);
      const alerts: Array<{ kind: PaymentAlertKind; dedupeKey: string; message: string; details?: Record<string, unknown> }> = [];
      let outcome: ApplyOutcome;
      let orderStatus: OrderStatus = order.status;
      let attemptStatus: PaymentAttemptStatus = attempt.status;
      const paidText = c.data.paidAmountKurus !== null ? formatPrice(c.data.paidAmountKurus) : "bilinmeyen tutar";
      const paymentRef = c.data.paymentId ? ` (sağlayıcı ödeme no ${c.data.paymentId})` : "";

      const terminal = TERMINAL_OUTCOME[attempt.status];
      if (terminal) {
        // Sonuçlanmış deneme otomatik değişmez; sıra dışı/tekrar gelen olay etkisiz kalır
        outcome = terminal;
      } else if (c.kind === "success") {
        const otherSuccess = await tx.paymentAttempt.findFirst({
          where: { orderId: order.id, status: "SUCCEEDED", id: { not: attempt.id } },
          select: { id: true },
        });
        // Eski düzende (payments tablosu) ödenmiş sipariş de "başarılı ödemesi var" sayılır
        const legacyPaid = await tx.payment.findFirst({
          where: { orderId: order.id, status: "SUCCESS" },
          select: { id: true },
        });

        if (otherSuccess || legacyPaid) {
          await tx.paymentAttempt.update({
            where: { id: attempt.id },
            data: { status: "DUPLICATE", ...providerFields(c.data), failureReason: "siparişin başka başarılı ödemesi var" },
          });
          attemptStatus = "DUPLICATE";
          outcome = "duplicate";
          alerts.push({
            kind: "DUPLICATE_PAYMENT",
            dedupeKey: `DUPLICATE_PAYMENT:${attempt.id}`,
            message: `Bu siparişin başka bir başarılı ödemesi var. ${paidText} tutarındaki ikinci ödeme${paymentRef} iade edilmeli (otomatik iade yapılmaz).`,
          });
        } else {
          // successOrderId UNIQUE: aynı siparişe ikinci başarılı deneme DB'de de yazılamaz
          await tx.paymentAttempt.update({
            where: { id: attempt.id },
            data: { status: "SUCCEEDED", successOrderId: order.id, failureReason: null, ...providerFields(c.data) },
          });
          attemptStatus = "SUCCEEDED";

          if (order.status === "PENDING") {
            const { count } = await tx.order.updateMany({
              where: { id: order.id, status: "PENDING" },
              data: { status: "PAID" },
            });
            if (count !== 1) throw new Error("Sipariş durumu kilit altındayken değişti");
            orderStatus = "PAID";
            outcome = "paid";
          } else if (order.status === "CANCELLED") {
            if (await tryReserveStockAgain(tx, order.id)) {
              const { count } = await tx.order.updateMany({
                where: { id: order.id, status: "CANCELLED" },
                data: { status: "PAID" },
              });
              if (count !== 1) throw new Error("Sipariş durumu kilit altındayken değişti");
              orderStatus = "PAID";
              outcome = "late_reopened";
              alerts.push({
                kind: "LATE_PAYMENT",
                dedupeKey: `LATE_PAYMENT:${attempt.id}`,
                message: `Ödeme (${paidText}${paymentRef}) sipariş süre dolup iptal edildikten sonra geldi. Stok vardı: stok yeniden ayrıldı ve sipariş "Ödendi" olarak açıldı. Müşteriyle teyit edip hazırlayın.`,
              });
            } else {
              outcome = "late_no_stock";
              alerts.push({
                kind: "LATE_PAYMENT_NO_STOCK",
                dedupeKey: `LATE_PAYMENT_NO_STOCK:${attempt.id}`,
                message: `Ödeme (${paidText}${paymentRef}) sipariş iptal edildikten sonra geldi ve stok yetersiz. Sipariş iptal durumunda kaldı. İADE ÖNERİLİR: müşteriyle iletişime geçin (otomatik iade yapılmaz).`,
              });
            }
          } else {
            outcome = "closed_order";
            alerts.push({
              kind: "PAYMENT_ON_CLOSED_ORDER",
              dedupeKey: `PAYMENT_ON_CLOSED_ORDER:${attempt.id}`,
              message: `Ödeme (${paidText}${paymentRef}) "${order.status}" durumundaki siparişe geldi. Kontrol edin.`,
            });
          }

          if (c.fraudReview) {
            alerts.push({
              kind: "FRAUD_REVIEW",
              dedupeKey: `FRAUD_REVIEW:${attempt.id}`,
              message: "iyzico ödemeyi incelemeye aldı (fraudStatus 0). iyzico panelinde sonuç netleşmeden kargolamayın.",
            });
          }
        }
      } else if (c.kind === "mismatch") {
        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: { status: "MISMATCH", ...providerFields(c.data), failureReason: c.reasons.join("; ").slice(0, 1000) },
        });
        attemptStatus = "MISMATCH";
        outcome = "mismatch";
        alerts.push({
          kind: "PAYMENT_MISMATCH",
          dedupeKey: `PAYMENT_MISMATCH:${attempt.id}`,
          message: `Sağlayıcı ödemeyi başarılı bildirdi ama doğrulama tutmadı: ${c.reasons.join("; ")}. Sipariş "Ödendi" yapılmadı; iyzico panelinden kontrol edin.`,
          details: { reasons: c.reasons },
        });
      } else if (c.kind === "failed") {
        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: { status: "FAILED", ...providerFields(c.data), failureReason: c.reason.slice(0, 1000) },
        });
        attemptStatus = "FAILED";
        outcome = "failed";
      } else {
        outcome = "pending";
      }

      // Doğrulama olayı her zaman yazılır (sağlayıcının o anki yanıtıyla). Tetikleyici gelen kutusundaki
      // bir webhook ise o satır da "işlendi" olarak kapanır.
      const verifyEvent = await recordPaymentEvent(tx, {
        source: input.source,
        eventType: `verify.${c.kind}`,
        provider: attempt.provider,
        orderId: order.id,
        attemptId: attempt.id,
        actorId: input.actorId,
        outcome,
        payload: {
          classification: c.kind,
          provider: c.data.raw,
          ...(c.kind === "mismatch" ? { reasons: c.reasons } : {}),
          ...(c.kind === "failed" || c.kind === "pending" ? { reason: c.reason } : {}),
          orderStatusBefore: order.status,
          orderStatusAfter: orderStatus,
          attemptStatusBefore: attempt.status,
          attemptStatusAfter: attemptStatus,
          ...(input.inboxEventId ? { inboxEventId: input.inboxEventId } : {}),
        },
      });
      if (input.inboxEventId) {
        await tx.paymentEvent.update({
          where: { id: input.inboxEventId },
          data: { status: "PROCESSED", outcome, orderId: order.id, attemptId: attempt.id, handledAt: new Date(), error: null },
        });
      }

      const raised: Array<{ kind: PaymentAlertKind; message: string }> = [];
      for (const alert of alerts) {
        const isNew = await raiseAlert(tx, { ...alert, orderId: order.id, attemptId: attempt.id, eventId: verifyEvent.id });
        if (isNew) raised.push({ kind: alert.kind, message: alert.message });
      }

      return {
        outcome,
        orderId: order.id,
        orderReference: order.reference,
        orderStatus,
        attemptStatus,
        alerts: raised,
      };
    },
    { timeout: 15_000, maxWait: 10_000 }
  );

  for (const alert of result.alerts) logAlert(alert.kind, result.orderReference, alert.message);
  return result;
}
