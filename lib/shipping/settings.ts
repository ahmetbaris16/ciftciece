/**
 * Kargo ayarları — saf veri + ayrıştırma (DB'siz). Sunucu, istemci ve seed aynı kuralları kullanır.
 *
 * Tek kargo firması: Yurtiçi Kargo (yalnız yurt içi gönderim).
 * Ücret sabit değildir: sepet paketlere (koli) yerleştirilir, her koli için gerçek ağırlık ile
 * desi karşılaştırılır ve Yurtiçi fiyatı buna göre alınır — bkz. quote.ts (akış), packing.ts
 * (koli planı), rates.ts (fiyat kaynağı: şimdilik anlaşmalı tarife tablosu, ileride Yurtiçi API).
 *
 * Burada hiçbir tutar ya da ölçü uydurulmaz: tarife, ürün paket ölçüleri ve koliler admin
 * panelinden (Ayarlar → Kargo) girilir. Eksikse kargo ücreti "hesaplanamadı" döner, rakam gösterilmez;
 * `recipientPaysWhenUnknown` açıksa (varsayılan) sipariş durmaz: gönderi ALICI ÖDEMELİ yapılır, kargo
 * ücretini müşteri teslimatta Yurtiçi Kargo'ya öder.
 * Ücretsiz kargo eşiği (varsayılan 3.000 TL) aşıldıysa ölçü/tarife gerekmez.
 */

export const SHIPPING_SETTING_KEY = "shipping";

export const CARRIER = { id: "yurtici", name: "Yurtiçi Kargo" } as const;
export type Carrier = typeof CARRIER;

/** Anlaşmalı tarife satırı: faturalanan desi/kg bu değere kadar (dahil) → ücret */
export interface TariffBand {
  maxDesi: number;
  priceKurus: number;
}

export interface YurticiTariff {
  /** maxDesi'ye göre artan sırada; boş = tarife girilmedi */
  bands: TariffBand[];
  /** Son satırın üstündeki her ilave desi için ücret; null = son satırdan büyük koli fiyatlanamaz */
  extraPerDesiKurus: number | null;
}

/** Bir ürün paketinin (şişe, kavanoz, teneke…) tartılıp ölçülmüş hali */
export interface PackagingMeasure {
  /** Brüt ağırlık (ürün + kabı), gram */
  grossGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  /** Cam/kırılabilir mi (koli içinde daha fazla dolgu payı ayrılır). Boşsa paket tipinin varsayılanı. */
  fragile?: boolean;
}

/** Dükkânın kullandığı koli (dış ölçüler; desi bunlardan hesaplanır) */
export interface ShippingBox {
  id: string;
  name: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  /** Koli dolu haldeyken en fazla taşıyabileceği ağırlık, gram */
  maxGrams: number;
  /** Boş koli + dolgu malzemesi ağırlığı, gram */
  tareGrams: number;
}

export interface ShippingSettings {
  freeThresholdKurus: number;
  tariff: YurticiTariff;
  /** Paket tipi kimliği (packaging.ts) → ölçü. Ölçülmemiş tip burada yoktur. */
  packaging: Record<string, PackagingMeasure>;
  boxes: ShippingBox[];
  /** Ücret hesaplanamazsa sipariş alıcı ödemeli gönderiyle devam etsin mi (kapalıysa sipariş alınmaz) */
  recipientPaysWhenUnknown: boolean;
}

/** Müşteri tarafına giden özet (tarife/ölçüler gönderilmez) */
export interface PublicShippingInfo {
  freeThresholdKurus: number;
  carrierName: string;
}

export const DEFAULT_SHIPPING_SETTINGS: ShippingSettings = {
  freeThresholdKurus: 300000, // 3.000 TL
  tariff: { bands: [], extraPerDesiKurus: null },
  packaging: {},
  boxes: [],
  recipientPaysWhenUnknown: true,
};

type ThresholdOnly = Pick<ShippingSettings, "freeThresholdKurus">;

export function isFreeShipping(subtotalKurus: number, settings: ThresholdOnly): boolean {
  return subtotalKurus >= settings.freeThresholdKurus;
}

/** Ücretsiz kargoya kalan tutar (eşik aşıldıysa 0) */
export function remainingForFreeShipping(subtotalKurus: number, settings: ThresholdOnly): number {
  return Math.max(0, settings.freeThresholdKurus - subtotalKurus);
}

export function toPublicShippingInfo(settings: ShippingSettings): PublicShippingInfo {
  return { freeThresholdKurus: settings.freeThresholdKurus, carrierName: CARRIER.name };
}

// ── Ayrıştırma ──────────────────────────────────────────────

const posInt = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
const nonNegInt = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};
const posNum = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null;
};

function parseTariff(raw: unknown): YurticiTariff {
  const t = (raw ?? {}) as Partial<YurticiTariff>;
  const bands = Array.isArray(t.bands)
    ? t.bands
        .map((b) => ({ maxDesi: posNum(b?.maxDesi), priceKurus: nonNegInt(b?.priceKurus) }))
        .filter((b): b is TariffBand => b.maxDesi !== null && b.priceKurus !== null)
        .sort((a, b) => a.maxDesi - b.maxDesi)
    : [];
  const extra = t.extraPerDesiKurus;
  return { bands, extraPerDesiKurus: extra === null || extra === undefined ? null : nonNegInt(extra) };
}

function parsePackaging(raw: unknown): Record<string, PackagingMeasure> {
  const out: Record<string, PackagingMeasure> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, m] of Object.entries(raw as Record<string, Partial<PackagingMeasure>>)) {
    const grossGrams = posInt(m?.grossGrams);
    const lengthCm = posNum(m?.lengthCm);
    const widthCm = posNum(m?.widthCm);
    const heightCm = posNum(m?.heightCm);
    if (grossGrams && lengthCm && widthCm && heightCm) {
      out[id] = { grossGrams, lengthCm, widthCm, heightCm };
      if (typeof m?.fragile === "boolean") out[id].fragile = m.fragile;
    }
  }
  return out;
}

function parseBoxes(raw: unknown): ShippingBox[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b: Partial<ShippingBox>) => ({
      id: typeof b?.id === "string" ? b.id : "",
      name: typeof b?.name === "string" ? b.name.trim() : "",
      lengthCm: posNum(b?.lengthCm),
      widthCm: posNum(b?.widthCm),
      heightCm: posNum(b?.heightCm),
      maxGrams: posInt(b?.maxGrams),
      tareGrams: nonNegInt(b?.tareGrams),
    }))
    .filter(
      (b): b is ShippingBox =>
        !!b.id && !!b.name && !!b.lengthCm && !!b.widthCm && !!b.heightCm && !!b.maxGrams && b.tareGrams !== null
    );
}

/**
 * DB'den gelen ham JSON'u doğrular; bozuksa varsayılana döner (loglanır).
 * Eski biçim (firma başına sabit ücret: `carriers`) yok sayılır — sabit ücret artık kullanılmıyor.
 */
export function parseShippingSettings(raw: string | null | undefined): ShippingSettings {
  if (!raw) return DEFAULT_SHIPPING_SETTINGS;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const threshold = nonNegInt(v.freeThresholdKurus);
    return {
      freeThresholdKurus: threshold ?? DEFAULT_SHIPPING_SETTINGS.freeThresholdKurus,
      tariff: parseTariff(v.tariff),
      packaging: parsePackaging(v.packaging),
      boxes: parseBoxes(v.boxes),
      recipientPaysWhenUnknown: v.recipientPaysWhenUnknown !== false,
    };
  } catch (err) {
    console.error("[shipping] Ayar JSON'u bozuk, varsayılan kullanılıyor:", err);
    return DEFAULT_SHIPPING_SETTINGS;
  }
}
