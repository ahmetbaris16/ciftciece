/**
 * Ürün paket tipleri — kargo hesabı için her varyantın FİZİKSEL kabı (şişe, kavanoz, teneke…).
 *
 * Aynı kabı paylaşan ürünler tek tipte toplanır (ör. 9 çeşit Gedelek 720 ml kavanoz turşu), böylece
 * dükkân her kabı bir kez tartıp ölçer. Ağırlık ve ölçüler burada YOK: admin → Ayarlar → Kargo'dan
 * girilir (settings.packaging). Ölçüsü girilmemiş bir tip sepette varsa kargo ücreti hesaplanmaz.
 *
 * `fragile` yalnızca varsayılandır (cam = kırılabilir); ölçü girilirken admin değiştirebilir.
 * Kataloğa yeni varyant eklenince SKU'su buraya eklenmeli; eklenmezse o ürünlü sepetlerde kargo
 * "hesaplanamadı" döner (admin kargo sayfası eksik SKU'ları listeler).
 */

export interface PackagingType {
  id: string;
  /** Admin'de görünen ad */
  label: string;
  fragile: boolean;
  skus: readonly string[];
}

export const PACKAGING_TYPES: readonly PackagingType[] = [
  // Zeytinyağı
  { id: "zeytinyagi-1l-cam", label: "Zeytinyağı 1 L cam şişe", fragile: true, skus: ["SYAG-1L"] },
  { id: "zeytinyagi-5l-teneke", label: "Zeytinyağı 5 L teneke", fragile: false, skus: ["SYAG-5L"] },
  { id: "zeytinyagi-500ml-sikmali", label: "Zeytinyağı 500 ml sıkmalı şişe", fragile: false, skus: ["SYAG-500"] },
  // Zeytin
  { id: "siyah-zeytin-kavanoz-siyah-kapak", label: "Sofralık siyah zeytin kavanozu (siyah kapak)", fragile: true, skus: ["SYZ-SIYAH"] },
  { id: "siyah-zeytin-kavanoz-sari-kapak", label: "Sofralık siyah zeytin kavanozu (sarı kapak)", fragile: true, skus: ["SYZ-SARI"] },
  { id: "zeytin-1kg", label: "Zeytin 1 kg paket (Gemlik, Keramet, Kuru Sele, Kızıl)", fragile: false, skus: ["GMZ-1KG", "KRZ-1KG", "KRSz-1KG", "KZZ-1KG"] },
  { id: "aymis-kavanoz-400g", label: "Aymis yeşil zeytin 400 g kavanoz", fragile: true, skus: ["AYM-KRM-400", "AYM-JLP-400", "AYM-LMN-400", "AYM-CZK-400"] },
  { id: "kavanoz-yesil-zeytin", label: "Kavanoz yeşil zeytin", fragile: true, skus: ["ZYT-KVZ-YSL"] },
  { id: "izgara-zeytin", label: "Kızartılmış (ızgara) zeytin", fragile: false, skus: ["ZYT-IZGR"] },
  // Sabun
  { id: "sabun-5-kalip", label: "5 kalıp zeytinyağlı sabun", fragile: false, skus: ["SAB-ZY-5K"] },
  // Turşu
  {
    id: "gedelek-kavanoz-720ml",
    label: "Gedelek turşu 720 ml kavanoz",
    fragile: true,
    skus: [
      "TRS-GDLK-ACR-720", "TRS-GDLK-BMY-720", "TRS-GDLK-BBR-720", "TRS-GDLK-KRS-720", "TRS-GDLK-MLH-720",
      "TRS-GDLK-SLT-720", "TRS-GDLK-FSL-720", "TRS-GDLK-AKB-720", "TRS-GDLK-LHN-720",
    ],
  },
  { id: "gedelek-kavanoz-500ml", label: "Gedelek sarımsak turşusu 500 ml kavanoz", fragile: true, skus: ["TRS-GDLK-SRM-500"] },
  { id: "gedelek-patlican-dolma", label: "Gedelek patlıcan dolma turşusu kavanoz", fragile: true, skus: ["TRS-GDLK-PTD"] },
  // Kahvaltılık
  { id: "aresto-sos", label: "Aresto kahvaltılık sos", fragile: true, skus: ["KHV-ARST"] },
  { id: "rifat-minare-275g", label: "Rifat Minare lütenitsa 275 g", fragile: true, skus: ["KHV-RFM-LTN-275"] },
  { id: "rifat-minare-530g", label: "Rifat Minare acı lütenitsa 530 g", fragile: true, skus: ["KHV-RFM-ALT-530"] },
  { id: "rifat-minare-1020g", label: "Rifat Minare közlenmiş biber 1020 g", fragile: true, skus: ["KHV-RFM-KZB-1020"] },
  { id: "rifat-minare-370g", label: "Rifat Minare patlıcan salatası 370 g", fragile: true, skus: ["KHV-RFM-PTS-370"] },
  { id: "rifat-minare-520g", label: "Rifat Minare salamura enginar 520 g", fragile: true, skus: ["KHV-RFM-ENG-520"] },
  { id: "tuzcu-390g", label: "Tuzcu kurutulmuş domates 390 g", fragile: true, skus: ["KHV-TZC-KRD-390"] },
  { id: "tuzcu-720g", label: "Tuzcu kurutulmuş domates 720 g", fragile: true, skus: ["KHV-TZC-KRD-720"] },
  { id: "ehlizade-recel-350g", label: "Ehlizade reçel 350 g", fragile: true, skus: ["DGR-EHL-CIR-350", "DGR-EHL-YIR-350"] },
  // Sirke & içecek
  { id: "ehlizade-sirke-500ml", label: "Ehlizade sirke 500 ml", fragile: true, skus: ["DGR-EHL-ALS-500", "DGR-EHL-ANS-500", "DGR-EHL-ELS-500"] },
  { id: "gilaburu-1l", label: "Herbal Palace gilaburu 1 L", fragile: true, skus: ["DGR-HBP-GLB-1L"] },
  // Kestane şekeri
  { id: "dagli-kestane-225g", label: "Bülent Dağlı kestane şekeri 225 g", fragile: false, skus: ["DGR-KST-225"] },
  { id: "dagli-kestane-450g", label: "Bülent Dağlı kestane şekeri 450 g", fragile: false, skus: ["DGR-KST-450"] },
  { id: "dagli-kestane-kavanoz", label: "Bülent Dağlı kavanoz kestane şekeri", fragile: true, skus: ["DGR-KST-KVN"] },
  { id: "yesilkent-kestane-250g", label: "Yeşilkent kestane şekeri 250 g", fragile: false, skus: ["YSLKNT-250"] },
  { id: "yesilkent-kestane-500g", label: "Yeşilkent kestane şekeri 500 g", fragile: false, skus: ["YSLKNT-500"] },
];

const BY_SKU: ReadonlyMap<string, PackagingType> = new Map(
  PACKAGING_TYPES.flatMap((t) => t.skus.map((sku) => [sku, t] as const))
);

export function packagingTypeForSku(sku: string | null | undefined): PackagingType | null {
  return sku ? BY_SKU.get(sku) ?? null : null;
}
