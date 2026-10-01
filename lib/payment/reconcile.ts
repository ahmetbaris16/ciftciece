/**
 * Elle mutabakat köprüsü — admin "iyzico'dan sorgula" (tek sipariş).
 *
 * Callback de webhook de kaçabilir; otomatik mutabakat işi henüz yok (Oturum 4). Admin bir sipariş
 * için iyzico'ya sorar: siparişin kart denemeleri tek tek sorgulanır, doğrulama (verify.ts) aynen
 * uygulanır ve gerekiyorsa durum düzeltilir (PENDING → PAID, geç ödeme, uyuşmazlık alarmı...).
 * Kim, ne zaman çalıştırdı: payment_events (source MANUAL, actorId) + audit_logs.
 * Dış çağrılar transaction dışındadır; her denemenin kaydı kendi transaction'ındadır.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createAuditLog } from "@/lib/security/audit";
import { getPaymentProvider } from "./provider";
import { recordPaymentEvent } from "./events";
import { verifyAttempt, type VerifyOutcome } from "./verify";

export const OUTCOME_TEXT: Record<VerifyOutcome, string> = {
  paid: "Ödeme doğrulandı; sipariş “Ödendi” yapıldı.",
  already_paid: "Ödeme zaten kayıtlı; değişiklik yok.",
  late_reopened: "Geç ödeme: stok yeniden ayrıldı, sipariş “Ödendi” yapıldı (Dikkat işaretli).",
  late_no_stock: "Geç ödeme: stok yok, sipariş iptal kaldı — iade önerilir (Dikkat işaretli).",
  duplicate: "Çift ödeme: bu siparişin başka başarılı ödemesi var — iade gerekir (Dikkat işaretli).",
  closed_order: "Kapanmış siparişe ödeme (Dikkat işaretli).",
  mismatch: "Doğrulama tutmadı; sipariş “Ödendi” yapılmadı (Dikkat işaretli).",
  failed: "Sağlayıcıya göre ödeme yok ya da başarısız.",
  pending: "Sağlayıcıda sonuç henüz yok (ara durum ya da ödenmemiş form).",
  unverified: "Sağlayıcıya sorulamadı; durum değişmedi.",
};

export interface ReconcileAttemptResult {
  attemptId: string;
  createdAt: string;
  statusBefore: string;
  statusAfter: string;
  outcome: VerifyOutcome;
  text: string;
  error?: string;
  reasons?: string[];
  /** Sağlayıcının yanıtı (süzülmüş: kart verisi yok) */
  provider?: Record<string, unknown>;
}

export interface ReconcileResult {
  orderId: string;
  reference: string;
  orderStatusBefore: string;
  orderStatusAfter: string;
  needsAttention: boolean;
  attempts: ReconcileAttemptResult[];
  message: string;
}

export class ReconcileError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "ReconcileError";
  }
}

/**
 * Bu sürümden önce açılmış (deneme kaydı olmayan) kart siparişinde eski payments satırındaki token
 * deneme olarak kaydedilir; böylece eski siparişler de sorgulanabilir. Eski kod conversationId olarak
 * sipariş id'sini gönderiyordu.
 */
async function adoptLegacyCardPayment(order: { id: string; totalKurus: number }, providerName: string) {
  const legacy = await prisma.payment.findUnique({ where: { orderId: order.id } });
  if (!legacy || legacy.provider !== providerName || !legacy.providerRef) return;
  if (await prisma.paymentAttempt.findFirst({ where: { orderId: order.id, providerToken: legacy.providerRef } })) return;
  try {
    await prisma.paymentAttempt.create({
      data: {
        orderId: order.id,
        provider: providerName,
        method: "CARD",
        amountKurus: order.totalKurus,
        currency: "TRY",
        conversationId: order.id,
        providerToken: legacy.providerRef,
      },
    });
  } catch (err) {
    // Aynı token eşzamanlı olarak başka yoldan kaydedildiyse sorun yok
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }
}

export async function reconcileOrderWithProvider(orderId: string, actorId: string): Promise<ReconcileResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, reference: true, status: true, paymentMethod: true, totalKurus: true },
  });
  if (!order) throw new ReconcileError("Sipariş bulunamadı", 404);
  if (order.paymentMethod !== "CARD") {
    throw new ReconcileError("Bu sipariş kartla ödenmiyor; ödeme sağlayıcısında kaydı yok.");
  }

  let providerName: string;
  try {
    providerName = getPaymentProvider().name;
  } catch (err) {
    throw new ReconcileError(`Ödeme sağlayıcısı hazır değil: ${(err as Error).message}`, 503);
  }

  await adoptLegacyCardPayment(order, providerName);
  const attempts = await prisma.paymentAttempt.findMany({
    where: { orderId: order.id, method: "CARD", providerToken: { not: null } },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const results: ReconcileAttemptResult[] = [];
  for (const attempt of attempts) {
    if (attempt.provider !== providerName) {
      results.push({
        attemptId: attempt.id,
        createdAt: attempt.createdAt.toISOString(),
        statusBefore: attempt.status,
        statusAfter: attempt.status,
        outcome: "unverified",
        text: OUTCOME_TEXT.unverified,
        error: `Deneme "${attempt.provider}" ile açılmış, etkin sağlayıcı "${providerName}".`,
      });
      continue;
    }
    const r = await verifyAttempt(attempt.id, { source: "MANUAL", actorId, force: true });
    results.push({
      attemptId: attempt.id,
      createdAt: attempt.createdAt.toISOString(),
      statusBefore: attempt.status,
      statusAfter: r.attemptStatus,
      outcome: r.outcome,
      text: OUTCOME_TEXT[r.outcome],
      error: r.error,
      reasons: r.reasons,
      provider: r.provider,
    });
  }

  const after = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: { status: true, needsAttention: true },
  });
  const message =
    attempts.length === 0
      ? "Bu siparişte sağlayıcıda sorgulanacak ödeme denemesi yok (ödeme formu hiç açılmamış)."
      : after.status !== order.status
        ? `Sipariş durumu düzeltildi: ${order.status} → ${after.status}.`
        : "Sipariş durumu değişmedi.";

  // Kim, ne zaman çalıştırdı — hem ödeme olaylarına hem audit kaydına
  await recordPaymentEvent(prisma, {
    source: "MANUAL",
    eventType: "manual_query.run",
    provider: providerName,
    orderId: order.id,
    actorId,
    outcome: after.status !== order.status ? "status_corrected" : "no_status_change",
    payload: {
      orderStatusBefore: order.status,
      orderStatusAfter: after.status,
      attempts: results.map((r) => ({ attemptId: r.attemptId, before: r.statusBefore, after: r.statusAfter, outcome: r.outcome, error: r.error ?? null })),
    },
  });
  await createAuditLog({
    userId: actorId,
    action: "order.payment_reconcile",
    entity: "order",
    entityId: order.id,
    details: { provider: providerName, orderStatusBefore: order.status, orderStatusAfter: after.status, attempts: results.length },
  });

  return {
    orderId: order.id,
    reference: order.reference,
    orderStatusBefore: order.status,
    orderStatusAfter: after.status,
    needsAttention: after.needsAttention,
    attempts: results,
    message,
  };
}
