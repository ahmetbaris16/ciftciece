/**
 * Kargo firmaları ve takip bağlantıları. İşletme yalnız Yurtiçi Kargo ile çalışıyor; "Diğer" seçeneği
 * gerektiğinde elle firma adı ve takip bağlantısı girmek içindir.
 *
 * Yurtiçi Kargo gönderi sorgulama sayfası doğrulandı (yurticikargo.com/tr/online-servisler/gonderi-sorgula);
 * sayfanın ?code= parametresiyle numarayı kendiliğinden doldurup doldurmadığı DOĞRULANMADI. Bu yüzden müşteriye
 * takip numarası her zaman ayrıca (kopyalanabilir) gösterilir.
 *
 * Yurtiçi gönderi kodunun biçimi (2026-10-07): resmi sorgulama sayfası hane sayısı vermiyor; kargo takip
 * sitelerine göre yalnız rakamdan oluşur, çoğunlukla 12 hane, hizmet tipine göre 11–14 hane olabilir. Bu yüzden
 * biçim KESİN kural değildir: uymayan numara için panel uyarır ve "numara doğru" onayı ister (yanlış yazım
 * yakalanır, gerçek ama farklı bir numara kargolamayı durdurmaz). İşletmenin gerçek fişleriyle teyit edilmeli.
 */

export interface Carrier {
  id: string;
  name: string;
  trackingUrl: ((code: string) => string) | null;
  /** Gönderi kodunun olağan biçimi; uymayan numarada uyarı + onay (kesin kural değil) */
  trackingFormat?: {
    /** Boşluk, tire ve nokta atılır (fişte gruplu yazılmış olabilir) */
    digitsOnly: boolean;
    pattern: RegExp;
    /** Alanın altında gösterilen kısa açıklama */
    hint: string;
    /** Uymayan numarada açıklama */
    expected: string;
  };
}

export const CARRIERS: Carrier[] = [
  {
    id: "yurtici",
    name: "Yurtiçi Kargo",
    trackingUrl: (code) =>
      `https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${encodeURIComponent(code)}`,
    trackingFormat: {
      digitsOnly: true,
      pattern: /^\d{11,14}$/,
      hint: "Kargo fişinde barkodun altındaki gönderi kodu: yalnız rakam, çoğunlukla 12 hane.",
      expected: "Yurtiçi Kargo gönderi kodu yalnız rakamdan oluşur, çoğunlukla 12 hanedir (11–14 hane olabilir)",
    },
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

/**
 * Takip numarası: boşluklar atılır, harfler büyütülür. Gönderi kodu yalnız rakam olan firmada (Yurtiçi) fişteki
 * gruplama işaretleri (tire, nokta) de atılır.
 */
export function normalizeTrackingNumber(value: string, carrierName?: string): string {
  const v = value.replace(/\s+/g, "").toUpperCase();
  const format = carrierName ? carrierByName(carrierName)?.trackingFormat : undefined;
  return format?.digitsOnly && /^[\d.-]+$/.test(v) ? v.replace(/[.-]/g, "") : v;
}

/** Her firma için kesin sınır: 6–40 karakter, harf/rakam/tire */
export const TRACKING_RULE_TEXT = "Takip numarası en az 6, en fazla 40 karakter olmalı (harf, rakam ya da tire).";

export function isValidTrackingNumber(value: string): boolean {
  return /^[A-Z0-9-]{6,40}$/.test(value);
}

/**
 * Numara firmanın olağan biçimine uymuyorsa açıklama (uyarı; kesin kural değil). Uyuyorsa ya da firmanın biçimi
 * tanımlı değilse (Diğer) null. Numara normalizeTrackingNumber'dan geçmiş olmalı.
 */
export function trackingFormatIssue(carrierName: string, normalized: string): string | null {
  const format = carrierByName(carrierName)?.trackingFormat;
  if (!format || format.pattern.test(normalized)) return null;
  const digits = /^\d+$/.test(normalized);
  return `${format.expected}; girilen numara ${digits ? `${normalized.length} hane` : "rakam dışında karakter içeriyor"}.`;
}
