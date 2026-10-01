/**
 * KDV oranı — baz puan (100 = %1). Ürün kaydında boş (null) = girilmemiş: oran uydurulmaz, sipariş
 * kalemine de boş kopyalanır (Y-12). Hangi ürüne hangi oranın uygulanacağı işletmenin/mali müşavirin
 * kararıdır; burada yalnız seçenekler var.
 */

/** Admin formunda sunulan oranlar (yüzde) — Türkiye'de 2023'ten beri uygulanan %1 / %10 / %20 ve %0 */
export const VAT_RATE_CHOICES = [0, 1, 10, 20] as const;

/** Form değeri ("" = girilmemiş, "10" = %10) → baz puan */
export function vatPercentToBps(value: string): number | null {
  if (value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n * 100 : null;
}

/** Baz puan → form değeri */
export function vatBpsToPercent(bps: number | null | undefined): string {
  return bps === null || bps === undefined ? "" : String(bps / 100);
}
