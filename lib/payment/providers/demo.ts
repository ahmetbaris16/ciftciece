/**
 * Demo banka — sanal POS bağlanana kadar kartla ödemenin baştan sona gösterimi (banka incelemesi, deneme).
 *
 * Akış Akbank ortak ödeme sayfasıyla aynıdır, yalnız "banka" sitenin kendi demo sayfasıdır:
 *   sipariş → ödeme denemesi → /demo-odeme/<deneme> (kart bilgileri + 6 haneli doğrulama kodu) →
 *   dönüş adresi (/api/payment/verify) → sonuç "bankadan" sunucuda sorgulanır (burada: demo kararı kaydı) →
 *   lib/payment/verify.ts denetimleri → sipariş "Ödendi".
 *
 * Gerçek para çekilmez. Kart bilgisi sunucuya HİÇ gönderilmez (demo sayfasında tarayıcıda kalır). Demo kararı
 * (onay / ret) payment_events'te denemeye özel tek kayıttır: (provider "demo", eventKey "decision:<deneme>")
 * UNIQUE olduğu için aynı denemeye hem onay hem ret yazılamaz. Kullanım kuralları: lib/payment/demo.ts.
 */

import { prisma } from "@/lib/db/prisma";
import { kurusToDecimalString } from "../money";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  RetrievePaymentInput,
  RetrievePaymentResult,
} from "../types";

export const DEMO_PROVIDER = "demo";

/** Demo sayfasının yolu (deneme id'siyle) */
export const demoPaymentPath = (attemptId: string) => `/demo-odeme/${encodeURIComponent(attemptId)}`;

/** Denemenin demo kararı kaydının anahtarı — deneme başına tek kayıt */
export const demoDecisionKey = (attemptId: string) => `decision:${attemptId}`;

export class DemoBankProvider implements PaymentProvider {
  readonly name = DEMO_PROVIDER;

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    // Deneme id'si "banka" sipariş no'sudur (Akbank'taki gibi); dönüşte token olarak gelir
    return {
      success: true,
      providerRef: input.attemptId,
      redirectUrl: new URL(demoPaymentPath(input.attemptId), input.callbackUrl).toString(),
    };
  }

  /** "Bankaya" sorgu: denemenin demo kararı. Karar yoksa ödeme henüz yapılmamıştır (müşteri sayfada / vazgeçti). */
  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentResult> {
    const attemptId = input.token;
    const [attempt, decision] = await Promise.all([
      prisma.paymentAttempt.findUnique({
        where: { id: attemptId },
        select: { id: true, orderId: true, provider: true, currency: true },
      }),
      prisma.paymentEvent.findUnique({
        where: { provider_eventKey: { provider: DEMO_PROVIDER, eventKey: demoDecisionKey(attemptId) } },
        select: { eventType: true, payload: true, processedAt: true },
      }),
    ]);
    if (!attempt || attempt.provider !== DEMO_PROVIDER) {
      return { ok: true, apiStatus: "failure", errorCode: "DEMO_NOT_FOUND", errorMessage: "demo ödeme kaydı yok", raw: {} };
    }
    if (!decision) {
      return { ok: true, apiStatus: "success", paymentStatus: "INIT", raw: { decision: null } };
    }

    const payload = (decision.payload ?? {}) as Record<string, unknown>;
    if (decision.eventType !== "demo.approved") {
      const reason = typeof payload.reason === "string" ? payload.reason : "demo ödeme onaylanmadı";
      return {
        ok: true,
        apiStatus: "success",
        paymentStatus: "FAILURE",
        errorCode: "DEMO_DECLINED",
        errorMessage: reason,
        raw: { decision: "declined", reason },
      };
    }

    // Onaylanan tutar onay anında denemeden alınır (sayfadaki tutar değil)
    const amountKurus = Number(payload.amountKurus);
    const price = Number.isSafeInteger(amountKurus) && amountKurus >= 0 ? kurusToDecimalString(amountKurus) : undefined;
    const authCode = typeof payload.authCode === "string" ? payload.authCode : "onay";
    return {
      ok: true,
      apiStatus: "success",
      paymentStatus: "SUCCESS",
      paymentId: `${DEMO_PROVIDER}:${attempt.id}:${authCode}`,
      basketId: attempt.orderId,
      conversationId: attempt.id,
      token: attempt.id,
      currency: attempt.currency,
      price,
      paidPrice: price,
      installment: 1,
      raw: { decision: "approved", authCode, amount: price ?? null, approvedAt: decision.processedAt.toISOString() },
    };
  }
}
