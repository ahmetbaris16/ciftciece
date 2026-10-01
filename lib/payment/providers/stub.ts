/**
 * Stub Payment Provider
 *
 * Test ve development için — her ödeme başarılı döner.
 * PAYMENT_PROVIDER=stub ile aktif.
 */

import type {
  PaymentProvider,
  CreatePaymentInput,
  CreatePaymentResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
  WebhookEvent,
} from "../types";

export class StubPaymentProvider implements PaymentProvider {
  readonly name = "stub";

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    console.log("[STUB PAYMENT] createPayment:", {
      orderId: input.orderId,
      amount: input.amountKurus,
    });

    return {
      success: true,
      providerRef: `stub-${input.orderReference}-${Date.now()}`,
      // callbackUrl zaten ?orderId= içerir
      redirectUrl: `${input.callbackUrl}${input.callbackUrl.includes("?") ? "&" : "?"}token=stub-success-token`,
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    console.log("[STUB PAYMENT] verifyPayment:", input);

    // Stub: yalnızca kendi ürettiği token kabul edilir
    if (input.token !== "stub-success-token") {
      return { success: false, error: "Geçersiz stub token" };
    }
    return {
      success: true,
      providerRef: `stub-verified-${Date.now()}`,
    };
  }

  async parseWebhook(rawBody: string): Promise<WebhookEvent | null> {
    console.log("[STUB PAYMENT] webhook:", rawBody);

    try {
      const data = JSON.parse(rawBody);
      return {
        eventType: "payment.success",
        providerEventId: `stub-webhook-${Date.now()}`,
        payload: data,
        status: "SUCCESS",
      };
    } catch {
      return null;
    }
  }
}
