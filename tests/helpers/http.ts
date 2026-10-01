/**
 * Route handler'ları test içinden çağırmak için istek üreticileri.
 */

import { NextRequest } from "next/server";
import { CHECKOUT_TERMS_VERSION } from "@/lib/legal/documents";

export function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Geçerli bir checkout gövdesi (iletişim/adres doğrulamasından geçer) */
export function checkoutBody(
  items: Array<{ variantId: string; quantity: number }>,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    items,
    contact: { firstName: "Ayşe", lastName: "Yılmaz", email: "ayse@example.com", phone: "0532 000 00 00" },
    shipping: { address: "Zeytinciler Çarşısı Muradiye Mahallesi No 1", district: "Orhangazi", city: "Bursa" },
    paymentMethod: "CARD",
    acceptTerms: true,
    termsVersion: CHECKOUT_TERMS_VERSION,
    ...extra,
  };
}
