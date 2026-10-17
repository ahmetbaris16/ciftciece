/**
 * Kargo ücreti hesabı — tek giriş noktası. Ürün fiyatlandırmasından ve ödeme sisteminden ayrıdır; girdi yalnız
 * ürünlerin sunucuda hesaplanmış ara toplamıdır.
 *
 *   ara toplam ≥ ücretsiz kargo sınırı → ücretsiz
 *   değilse                             → sabit kargo ücreti
 *
 * Sunucu (sipariş, /api/shipping/quote) aynı fonksiyonu çağırır; istemci tutarı hiçbir zaman kendisi hesaplamaz.
 */

import { CARRIER, isFreeShipping, type Carrier, type ShippingSettings } from "./settings";

export type ShippingQuote =
  | { status: "free"; carrier: Carrier; feeKurus: 0 }
  | { status: "priced"; carrier: Carrier; feeKurus: number }
  /** Artık üretilmez (ücret her zaman vardır); yalnız eski siparişlerin kaydı ve eski istemciler için tip olarak durur */
  | { status: "recipient"; carrier: Carrier; feeKurus: 0 };

export function quoteShipping(input: { subtotalKurus: number }, settings: ShippingSettings): ShippingQuote {
  if (isFreeShipping(input.subtotalKurus, settings)) return { status: "free", carrier: CARRIER, feeKurus: 0 };
  return { status: "priced", carrier: CARRIER, feeKurus: settings.feeKurus };
}

/** Siparişe yazılan kargo ödeme şekli */
export function shippingModeOf(q: ShippingQuote) {
  return q.status === "free" ? "free" : q.status === "priced" ? "prepaid" : "recipient";
}

/** Alıcı ödemeli gönderide müşteriye gösterilen açıklama */
export const RECIPIENT_PAYS_NOTE =
  "Kargo ücreti teslimatta Yurtiçi Kargo görevlisine ödenir (alıcı ödemeli gönderi).";
