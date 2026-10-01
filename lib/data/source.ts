/**
 * Veri kaynağı seçimi — tek yerden.
 *
 * - DATABASE_URL varsa her zaman gerçek DB kullanılır. DB hatası YUTULMAZ,
 *   çağırana fırlatılır (mock'a sessizce düşmek yanlış fiyat/stok göstermek demek).
 * - DATABASE_URL yoksa mock veri SADECE development'ta ve konsola uyarı basılarak
 *   kullanılır. Production'da DATABASE_URL eksikse bu bir kurulum hatasıdır.
 */

export const USE_DB = !!process.env.DATABASE_URL;

let warned = false;

export async function loadMock() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL tanımlı değil — production'da mock veri kullanılamaz."
    );
  }
  if (!warned) {
    warned = true;
    console.warn(
      "[data] DATABASE_URL tanımlı değil — MOCK veri kullanılıyor (sadece development)."
    );
  }
  return import("@/lib/data/mock");
}
