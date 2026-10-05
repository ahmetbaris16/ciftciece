/**
 * Kargo ayarları — saf veri + ayrıştırma (DB'siz). Sunucu, istemci ve seed aynı kuralları kullanır.
 *
 * Tek kargo firması: Yurtiçi Kargo (yalnız yurt içi gönderim).
 * Ücret sabittir: her siparişe aynı kargo ücreti eklenir; ara toplam ücretsiz kargo sınırına ulaşırsa kargo
 * ücretsizdir. Ücret admin panelinden (Ayarlar → Kargo) girilir; girilmemişse tutar uydurulmaz: gönderi ALICI
 * ÖDEMELİ olur (müşteri kargo ücretini teslimatta Yurtiçi Kargo'ya öder).
 *
 * Eski sürümdeki desi tarifesi / koli / paket ölçüsü alanları DB'deki JSON'da kalabilir; okunmaz.
 */

export const SHIPPING_SETTING_KEY = "shipping";

export const CARRIER = { id: "yurtici", name: "Yurtiçi Kargo" } as const;
export type Carrier = typeof CARRIER;

export interface ShippingSettings {
  /** Her siparişe eklenen sabit kargo ücreti (kuruş); null = henüz girilmedi */
  feeKurus: number | null;
  /** Ara toplam bu tutar ve üzerindeyse kargo ücretsiz (kuruş) */
  freeThresholdKurus: number;
}

/** Müşteri tarafına giden özet */
export interface PublicShippingInfo {
  feeKurus: number | null;
  freeThresholdKurus: number;
  carrierName: string;
}

export const DEFAULT_SHIPPING_SETTINGS: ShippingSettings = {
  feeKurus: null,
  freeThresholdKurus: 300000, // 3.000 TL
};

type ThresholdOnly = Pick<ShippingSettings, "freeThresholdKurus">;

export function isFreeShipping(subtotalKurus: number, settings: ThresholdOnly): boolean {
  return subtotalKurus >= settings.freeThresholdKurus;
}

/** Ücretsiz kargoya kalan tutar (sınır aşıldıysa 0) */
export function remainingForFreeShipping(subtotalKurus: number, settings: ThresholdOnly): number {
  return Math.max(0, settings.freeThresholdKurus - subtotalKurus);
}

export function toPublicShippingInfo(settings: ShippingSettings): PublicShippingInfo {
  return { feeKurus: settings.feeKurus, freeThresholdKurus: settings.freeThresholdKurus, carrierName: CARRIER.name };
}

const nonNegInt = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

/** DB'den gelen ham JSON'u doğrular; bozuksa varsayılana döner (loglanır). */
export function parseShippingSettings(raw: string | null | undefined): ShippingSettings {
  if (!raw) return DEFAULT_SHIPPING_SETTINGS;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    return {
      feeKurus: nonNegInt(v.feeKurus),
      freeThresholdKurus: nonNegInt(v.freeThresholdKurus) ?? DEFAULT_SHIPPING_SETTINGS.freeThresholdKurus,
    };
  } catch (err) {
    console.error("[shipping] Ayar JSON'u bozuk, varsayılan kullanılıyor:", err);
    return DEFAULT_SHIPPING_SETTINGS;
  }
}
