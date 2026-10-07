/**
 * Seçeneğe (varyanta) özel kısa bilgi — ürün sayfasında o seçenek seçiliyken seçeneklerin altında yazar.
 * SKU ile eşleşir (panelde değişmez). Yalnız işletmenin verdiği, doğrulanmış bilgi yazılır.
 */

const VARIANT_NOTES: Record<string, string> = {
  // Kullanıcı (2026-10-07): siyah ve sarı kapaklı kavanozlarda aynı zeytin; tek fark siyah kapağın altındaki jelatin
  "SYZ-SIYAH": "Kapağın altında jelatin koruma bulunur.",
};

export function variantNote(sku: string | null | undefined): string | null {
  return sku ? (VARIANT_NOTES[sku] ?? null) : null;
}
