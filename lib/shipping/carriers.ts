/**
 * Kargo firmaları ve takip bağlantıları. İşletme yalnız Yurtiçi Kargo ile çalışıyor; "Diğer" seçeneği
 * gerektiğinde elle firma adı ve takip bağlantısı girmek içindir.
 *
 * Yurtiçi Kargo gönderi sorgulama sayfası doğrulandı (yurticikargo.com/tr/online-servisler/gonderi-sorgula);
 * sayfanın ?code= parametresiyle numarayı kendiliğinden doldurup doldurmadığı DOĞRULANMADI. Bu yüzden müşteriye
 * takip numarası her zaman ayrıca (kopyalanabilir) gösterilir.
 */

export interface Carrier {
  id: string;
  name: string;
  trackingUrl: ((code: string) => string) | null;
}

export const CARRIERS: Carrier[] = [
  {
    id: "yurtici",
    name: "Yurtiçi Kargo",
    trackingUrl: (code) =>
      `https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${encodeURIComponent(code)}`,
  },
];

export const DEFAULT_CARRIER = CARRIERS[0];

export function carrierByName(name: string): Carrier | undefined {
  return CARRIERS.find((c) => c.name === name || c.id === name);
}

/** Takip bağlantısı: admin'in girdiği bağlantı, yoksa firmanın sorgulama sayfası */
export function trackingLinkFor(carrierName: string, trackingNumber: string, explicitUrl?: string | null): string | null {
  if (explicitUrl) return explicitUrl;
  const carrier = carrierByName(carrierName);
  return carrier?.trackingUrl ? carrier.trackingUrl(trackingNumber) : null;
}

/** Takip numarası: harf, rakam ve tire; boşluklar atılır */
export function normalizeTrackingNumber(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function isValidTrackingNumber(value: string): boolean {
  return /^[A-Z0-9-]{6,40}$/.test(value);
}
