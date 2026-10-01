/**
 * Kargo fiyat kaynağı — koli planını (packing.ts) Yurtiçi Kargo ücretine çevirir.
 *
 * Ürün fiyatlarından ve ödeme sisteminden bağımsızdır; yalnız kolilerin faturalanan desisini bilir.
 * Şimdilik tek kaynak: dükkânın Yurtiçi Kargo ile anlaştığı desi tarifesi (admin → Ayarlar → Kargo).
 * Tarife girilmemişse ücret "bilinmiyor" döner — tahmini rakam üretilmez.
 *
 * Yurtiçi Kargo API'si bağlanacağında: aynı `ShippingRateProvider` arayüzünü uygulayan bir sağlayıcı
 * yazılır (ör. createYurticiApiProvider(credentials)) ve getRateProvider() onu döndürür; sepet,
 * ödeme ve sipariş kodu değişmez. `destination` API'nin il/ilçe bazlı fiyatı için taşınır.
 */

import type { PlannedParcel } from "./packing";
import type { ShippingSettings, YurticiTariff } from "./settings";

export interface RateRequest {
  parcels: PlannedParcel[];
  destination?: { city: string; district: string };
}

export type RateResult =
  | { ok: true; feeKurus: number; parcelFeesKurus: number[] }
  | { ok: false; reason: "NO_TARIFF" | "OVER_TARIFF" | "PROVIDER_ERROR" };

export interface ShippingRateProvider {
  readonly id: string;
  rate(request: RateRequest): Promise<RateResult>;
}

/** Anlaşmalı tarife: her koli, faturalanan desisinin düştüğü satırın ücretini alır; koliler toplanır. */
export function createTariffProvider(tariff: YurticiTariff): ShippingRateProvider {
  return {
    id: "yurtici-tarife",
    async rate({ parcels }) {
      if (tariff.bands.length === 0) return { ok: false, reason: "NO_TARIFF" };
      const last = tariff.bands[tariff.bands.length - 1];
      const parcelFeesKurus: number[] = [];
      for (const p of parcels) {
        const band = tariff.bands.find((b) => p.billableDesi <= b.maxDesi);
        if (band) {
          parcelFeesKurus.push(band.priceKurus);
        } else if (tariff.extraPerDesiKurus !== null) {
          parcelFeesKurus.push(last.priceKurus + Math.ceil(p.billableDesi - last.maxDesi) * tariff.extraPerDesiKurus);
        } else {
          return { ok: false, reason: "OVER_TARIFF" };
        }
      }
      return { ok: true, feeKurus: parcelFeesKurus.reduce((a, b) => a + b, 0), parcelFeesKurus };
    },
  };
}

/** Kullanılacak fiyat kaynağı — Yurtiçi API bağlandığında yalnız burası değişir. */
export function getRateProvider(settings: ShippingSettings): ShippingRateProvider {
  return createTariffProvider(settings.tariff);
}
