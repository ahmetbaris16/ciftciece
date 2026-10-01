import { revalidatePath } from "next/cache";

/**
 * Admin'de ürün/fiyat/stok/kategori/yorum değişince vitrin sayfalarının
 * (ana sayfa, ürün, kategori, liste) önbelleğini hemen geçersiz kılar.
 * Sayfalardaki `revalidate = 60` bunun emniyet ağıdır.
 */
export function revalidateStorefront() {
  revalidatePath("/", "layout");
}
