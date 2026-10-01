/**
 * Stub Payment Provider
 *
 * Yalnız geliştirme: her ödeme başarılı sayılır, para çekilmez. PAYMENT_PROVIDER=stub (varsayılan).
 * Production'da ALLOW_STUB_PAYMENTS=true olmadan açılmaz (lib/payment/provider.ts).
 *
 * Token sorgu sonucunu taklit edebilmek için deneme, tutar ve sipariş kimliğini taşır:
 * "stub.<denemeId>.<kuruş>.<siparişId>". Doğrulama (verify.ts) gerçek sağlayıcıdaki gibi uygulanır.
 */

import { kurusToDecimalString } from "../money";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  RetrievePaymentInput,
  RetrievePaymentResult,
} from "../types";

export class StubPaymentProvider implements PaymentProvider {
  readonly name = "stub";

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const token = `stub.${input.attemptId}.${input.amountKurus}.${input.orderId}`;
    console.log("[STUB PAYMENT] createPayment:", { attemptId: input.attemptId, amount: input.amountKurus });
    return {
      success: true,
      providerRef: token,
      tokenExpiresAt: new Date(Date.now() + 30 * 60_000),
      // callbackUrl zaten ?attempt= içerir
      redirectUrl: `${input.callbackUrl}${input.callbackUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`,
    };
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentResult> {
    const [prefix, attemptId, amount, orderId] = input.token.split(".");
    const amountKurus = Number(amount);
    if (prefix !== "stub" || !attemptId || !orderId || !Number.isSafeInteger(amountKurus)) {
      return { ok: true, apiStatus: "failure", errorCode: "STUB", errorMessage: "Geçersiz stub token", raw: {} };
    }
    const price = kurusToDecimalString(amountKurus);
    const raw = {
      status: "success",
      paymentStatus: "SUCCESS",
      paymentId: `stub-${attemptId}`,
      price,
      paidPrice: price,
      currency: "TRY",
      basketId: orderId,
      conversationId: input.conversationId ?? attemptId,
      token: input.token,
      installment: 1,
      fraudStatus: 1,
    };
    return {
      ok: true,
      apiStatus: "success",
      paymentStatus: "SUCCESS",
      paymentId: raw.paymentId,
      basketId: orderId,
      conversationId: raw.conversationId,
      token: input.token,
      currency: "TRY",
      price,
      paidPrice: price,
      installment: 1,
      fraudStatus: 1,
      raw,
    };
  }
}
