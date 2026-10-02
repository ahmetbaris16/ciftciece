/**
 * KDV oranı — baz puan (100 = %1). Ürün kaydında boş (null) = girilmemiş: oran uydurulmaz, sipariş
 * kalemine de boş kopyalanır (Y-12). Hangi ürüne hangi oranın uygulanacağı işletmenin/mali müşavirin
 * kararıdır; admin oranı elle yazar, aşağıdakiler yalnız hızlı seçim düğmeleridir.
 */

/** Hızlı seçim (yüzde) — Türkiye'de 2023'ten beri uygulanan %1 / %10 / %20 ve %0 */
export const VAT_RATE_CHOICES = [0, 1, 10, 20] as const;

export const VAT_INPUT_RULE = "0 ile 100 arasında tam sayı yazın (ör. 10).";

export type VatParseResult = { ok: true; bps: number | null } | { ok: false };

/**
 * Formdaki metin ("10", "%10", "10 %") → baz puan. Boş = girilmemiş (null).
 * Geçersiz giriş ok:false döner: sessizce "girilmemiş" diye kaydedilmez.
 */
export function parseVatPercent(text: string): VatParseResult {
  const raw = text.trim();
  if (raw === "") return { ok: true, bps: null };
  const t = raw.replace(/^%\s*/, "").replace(/\s*%$/, "");
  if (!/^\d{1,3}$/.test(t)) return { ok: false };
  const percent = Number(t);
  return percent <= 100 ? { ok: true, bps: percent * 100 } : { ok: false };
}

/** Baz puan → form değeri */
export function vatBpsToPercent(bps: number | null | undefined): string {
  return bps === null || bps === undefined ? "" : String(bps / 100);
}
