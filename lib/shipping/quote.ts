/**
 * Kargo ücreti hesabı — tek giriş noktası. Ürün fiyatlandırmasından ve ödeme sisteminden ayrıdır:
 * girdi yalnız sepet satırları (SKU + adet) ve ara toplamdır (ücretsiz kargo eşiği için).
 *
 *   ara toplam ≥ eşik           → ücretsiz
 *   değilse: koli planı (packing) → fiyat kaynağı (rates) → ücret
 *   ölçü/koli/tarife eksikse    → "recipient" (alıcı ödemeli: kargo teslimatta ödenir; varsayılan)
 *                                  ya da ayar kapalıysa "unknown": sipariş alınmaz. İkisinde de rakam yok.
 *
 * Sunucu (sipariş, /api/shipping/quote) aynı fonksiyonu çağırır; istemci tutarı hiçbir zaman
 * kendisi hesaplamaz.
 */

import { planParcels, type PlannedParcel, type ShippingLine } from "./packing";
import { getRateProvider, type RateRequest, type ShippingRateProvider } from "./rates";
import { CARRIER, isFreeShipping, type Carrier, type ShippingSettings } from "./settings";

export type { ShippingLine } from "./packing";

/** Müşteriye gösterilen açıklama (ödeme ve sepet ekranı) */
export const SHIPPING_BASIS_NOTE = "Kargo ücreti, siparişinizin ağırlığı ve paket boyutuna göre hesaplanır.";

export type UnknownReason =
  | "NOT_MEASURED" // sepetteki bir ürünün paket ölçüsü girilmemiş
  | "NO_BOX" // koli ölçüleri girilmemiş
  | "OVERSIZE" // ürün hiçbir koliye sığmıyor
  | "NO_TARIFF" // Yurtiçi tarifesi girilmemiş / API bağlı değil
  | "OVER_TARIFF" // koli tarifenin son satırını aşıyor, ilave desi ücreti yok
  | "PROVIDER_ERROR";

export interface ParcelQuote extends PlannedParcel {
  feeKurus: number;
}

export type ShippingQuote =
  | { status: "free"; carrier: Carrier; feeKurus: 0 }
  /** Ücret hesaplanamadı, gönderi alıcı ödemeli: siparişte kargo tahsil edilmez, teslimatta ödenir */
  | { status: "recipient"; carrier: Carrier; feeKurus: 0; reason: UnknownReason; skus?: string[] }
  | { status: "priced"; carrier: Carrier; feeKurus: number; parcels: ParcelQuote[] }
  | { status: "unknown"; carrier: Carrier; reason: UnknownReason; skus?: string[] };

export interface ShippingQuoteInput {
  lines: ShippingLine[];
  /** Ürünlerin sunucuda hesaplanmış ara toplamı (kuruş) */
  subtotalKurus: number;
  destination?: RateRequest["destination"];
}

export async function quoteShipping(
  input: ShippingQuoteInput,
  settings: ShippingSettings,
  provider: ShippingRateProvider = getRateProvider(settings)
): Promise<ShippingQuote> {
  if (isFreeShipping(input.subtotalKurus, settings)) {
    return { status: "free", carrier: CARRIER, feeKurus: 0 };
  }

  const unknown = (reason: UnknownReason, skus?: string[]): ShippingQuote =>
    settings.recipientPaysWhenUnknown
      ? { status: "recipient", carrier: CARRIER, feeKurus: 0, reason, skus }
      : { status: "unknown", carrier: CARRIER, reason, skus };

  const plan = planParcels(input.lines, settings.packaging, settings.boxes);
  if (!plan.ok) return unknown(plan.reason, plan.skus);

  let rate: Awaited<ReturnType<ShippingRateProvider["rate"]>>;
  try {
    rate = await provider.rate({ parcels: plan.parcels, destination: input.destination });
  } catch (err) {
    console.error(`[shipping] ${provider.id} fiyat veremedi:`, err);
    return unknown("PROVIDER_ERROR");
  }
  if (!rate.ok) return unknown(rate.reason);

  return {
    status: "priced",
    carrier: CARRIER,
    feeKurus: rate.feeKurus,
    parcels: plan.parcels.map((p, i) => ({ ...p, feeKurus: rate.parcelFeesKurus[i] ?? 0 })),
  };
}

/** Sipariş ve ödeme ekranı: bu teklifle sipariş tamamlanabilir mi (şimdi tahsil edilecek kargo tutarı kesin mi)? */
export function isQuoteFinal(
  q: ShippingQuote
): q is Extract<ShippingQuote, { status: "free" | "priced" | "recipient" }> {
  return q.status !== "unknown";
}

/** Siparişe yazılan kargo ödeme şekli */
export function shippingModeOf(q: Extract<ShippingQuote, { status: "free" | "priced" | "recipient" }>) {
  return q.status === "free" ? "free" : q.status === "priced" ? "prepaid" : "recipient";
}

/** Alıcı ödemeli gönderide müşteriye gösterilen açıklama */
export const RECIPIENT_PAYS_NOTE =
  "Kargo ücreti teslimatta Yurtiçi Kargo görevlisine ödenir (alıcı ödemeli gönderi).";
