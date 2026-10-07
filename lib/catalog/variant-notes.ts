/**
 * Seçeneğe (varyanta) özel bilgi — ürün sayfasında o seçenek seçiliyken seçeneklerin altında yazar. Seçenekler
 * arasında fiyat farkı varsa nedenini de söyler: müşteri seçenek değiştirince fiyatın neden arttığını ya da azaldığını
 * anlasın (kullanıcı isteği 2026-10-07). Fark tutarı o anki fiyatlardan hesaplanır (panelden fiyat değişirse metin de
 * değişir). SKU ile eşleşir (panelde değişmez). Yalnız işletmenin verdiği, doğrulanmış bilgi yazılır.
 */

import { formatPrice } from "@/types";

interface CompareOption {
  /** Seçiliyken yazan bilgi */
  note: string;
  /** Diğer seçenekle karşılaştırma cümlesinin başı */
  same: string;
  /** Farkı yaratan özellik bu seçenekte var mı (varsa daha pahalı olması beklenir) */
  has: boolean;
}

interface CompareGroup {
  /** Pahalı seçenekte fark gerekçesi (özellik var) */
  reasonHas: string;
  /** Ucuz seçenekte fark gerekçesi (özellik yok) */
  reasonHasNot: string;
  /** Fark neye göre: "kavanoz başına" */
  per: string;
  options: Record<string, CompareOption>;
}

const GROUPS: CompareGroup[] = [
  // Kullanıcı (2026-10-07): siyah ve sarı kapaklı kavanozlarda aynı zeytin; tek fark siyah kapağın altındaki jelatin
  // koruma. Fiyatlar: siyah ₺350, sarı ₺200 (bu ürün dışında kapak seçeneği yok)
  {
    reasonHas: "jelatin koruma nedeniyle",
    reasonHasNot: "jelatin koruma olmadığı için",
    per: "kavanoz başına",
    options: {
      "SYZ-SIYAH": {
        note: "Kapağın altında jelatin koruma bulunur.",
        same: "Zeytin, sarı kapaklı kavanozdakiyle aynıdır",
        has: true,
      },
      "SYZ-SARI": {
        note: "Kapağın altında jelatin koruma yoktur.",
        same: "Zeytin, siyah kapaklı kavanozdakiyle aynıdır",
        has: false,
      },
    },
  },
];

export interface VariantExplanation {
  /** "Kapağın altında jelatin koruma bulunur." */
  note: string;
  /** "Zeytin, sarı kapaklı kavanozdakiyle aynıdır; jelatin koruma nedeniyle kavanoz başına ₺150,00 daha fazladır." */
  compare: string;
}

type PricedVariant = { sku?: string | null; priceKurus: number };

/** Seçili seçeneğin açıklaması ve diğer seçenekle fiyat farkının nedeni; tanımlı değilse null */
export function variantExplanation(selected: PricedVariant, variants: PricedVariant[]): VariantExplanation | null {
  const sku = selected.sku;
  if (!sku) return null;
  const inGroup = (g: CompareGroup, s: string) => Object.prototype.hasOwnProperty.call(g.options, s);
  const group = GROUPS.find((g) => inGroup(g, sku));
  if (!group) return null;
  const option = group.options[sku];
  const other = variants.find((v) => v.sku && v.sku !== sku && inGroup(group, v.sku));
  if (!other) return { note: option.note, compare: `${option.same}.` };

  const diff = selected.priceKurus - other.priceKurus;
  if (diff === 0 || selected.priceKurus <= 0 || other.priceKurus <= 0) return { note: option.note, compare: `${option.same}.` };
  const more = diff > 0;
  // Gerekçe yalnız fark beklenen yöndeyse yazılır (fiyatlar ters girilirse uydurma neden söylenmez)
  const reason = more && option.has ? `${group.reasonHas} ` : !more && !option.has ? `${group.reasonHasNot} ` : "";
  return {
    note: option.note,
    compare: `${option.same}; ${reason}${group.per} ${formatPrice(Math.abs(diff))} daha ${more ? "fazladır" : "uygundur"}.`,
  };
}
