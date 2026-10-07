/**
 * Paneldeki stok alanı: yönetici alanı silip istediği sayıyı klavyeyle yazar (alan "0"a geri dönmez).
 * Boş = 0; "1.000" (binlik nokta) = 1000. Geçersiz giriş (eksi, kesir, harf) null döner: sessizce 0'a ya da
 * başka bir sayıya çevrilmez, form kaydetmeden önce uyarır.
 */

export const STOCK_INPUT_RULE = "0 ya da daha büyük tam sayı yazın (ör. 25).";

export function parseStockInput(text: string): number | null {
  const t = text.replace(/\s/g, "");
  if (t === "") return 0;
  const digits = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  // En çok 7 hane: veritabanındaki Int sınırının çok altında, elle yazılabilecek her stok
  return /^\d{1,7}$/.test(digits) ? Number(digits) : null;
}
