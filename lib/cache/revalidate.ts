import { revalidatePath } from "next/cache";

/**
 * Admin'de ürün/fiyat/stok/kategori/yorum değişince vitrin sayfalarının
 * (ana sayfa, ürün, kategori, liste) önbelleğini hemen geçersiz kılar.
 * Sayfalardaki `revalidate = 60` bunun emniyet ağıdır.
 */
export function revalidateStorefront() {
  revalidatePath("/", "layout");
}

/**
 * Ürün sayfasının önbelleğini tazeler (ör. yeni değerlendirme yayınlanınca). Kayıt zaten yazılmışken tazeleme hatası
 * isteği başarısız göstermesin: hata loglanır, sayfa en geç `revalidate = 60` ile yenilenir.
 */
export function revalidateProductPage(slug: string) {
  try {
    revalidatePath(`/urun/${slug}`);
  } catch (err) {
    console.warn(`[önbellek] /urun/${slug} tazelenemedi:`, err instanceof Error ? err.message : err);
  }
}
