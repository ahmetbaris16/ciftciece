/**
 * Ürün sayfası "Ürün Açıklaması" bölümündeki kullanım ve saklama önerileri.
 *
 * Kategori düzeyinde GENEL önerilerdir; ürün etiketindeki bilgi her zaman esastır (sayfada yazar).
 * Ürüne özel bilgi gerekiyorsa PRODUCT_GUIDES'a slug ile eklenir (kategori önerisinin üstüne yazar).
 * Burada ürün hakkında doğrulanmamış iddia (asit oranı, menşe, katkı vb.) YAZILMAZ.
 */

export interface ProductGuide {
  usage?: string[];
  storage?: string;
}

const CATEGORY_GUIDES: Record<string, ProductGuide> = {
  zeytinyagi: {
    usage: [
      "Salata, kahvaltı ve mezelerde çiğ olarak",
      "Sebze yemekleri ve zeytinyağlılarda",
      "Tabakta ekmek banmak için",
    ],
    storage: "Serin, kuru ve güneş almayan bir yerde, kapağı sıkıca kapalı saklayın.",
  },
  zeytin: {
    usage: ["Kahvaltı sofralarında", "Salata, meze ve hamur işlerinde"],
    storage:
      "Açıldıktan sonra buzdolabında saklayın; zeytinlerin kendi salamurası ya da yağı içinde kalmasına dikkat edin.",
  },
  kahvaltilik: {
    usage: ["Kahvaltı sofralarında", "Meze, sandviç ve ara öğünlerde"],
    storage: "Açılmadan serin ve kuru yerde, açıldıktan sonra ağzı kapalı olarak buzdolabında saklayın.",
  },
  tursu: {
    usage: ["Ana yemeklerin yanında", "Meze tabaklarında"],
    storage: "Açıldıktan sonra buzdolabında saklayın; turşunun suyunun içinde kalmasına dikkat edin.",
  },
  "kestane-sekeri": {
    usage: ["Çay ve kahve yanında", "Tatlı ve ikramlarda"],
    storage: "Serin ve kuru yerde saklayın; açıldıktan sonra ağzını kapatıp buzdolabında muhafaza edin.",
  },
  "sirke-icecek": {
    usage: ["Salata soslarında ve turşularda (sirkeler)"],
    storage: "Serin ve kuru yerde, güneş ışığından uzak saklayın; kullandıktan sonra kapağını kapatın.",
  },
  sabun: {
    usage: ["El ve vücut temizliğinde"],
    storage: "Kullanımlar arasında kuruması için süzgeçli bir sabunlukta saklayın.",
  },
};

const PRODUCT_GUIDES: Record<string, ProductGuide> = {
  "ciftciece-sikmali-sise-zeytinyagi-500ml": {
    usage: [
      "Şişeyi hafifçe sıkarak salataya, kahvaltıya ya da tavaya istediğiniz kadar dökün",
      "İnce bir çizgi hâlinde gezdirerek tabağı süsleyin",
      "Kullandıktan sonra kapağını kapatın",
    ],
  },
  "herbal-palace-gilaburu-nektari": {
    usage: ["Soğuk olarak, kahvaltıda ya da gün içinde"],
    storage: "Açılmadan serin ve kuru yerde; açıldıktan sonra buzdolabında saklayıp kısa sürede tüketin.",
  },
};

export function getProductGuide(slug: string, categorySlug: string): ProductGuide {
  const base = CATEGORY_GUIDES[categorySlug] ?? {};
  const own = PRODUCT_GUIDES[slug] ?? {};
  return { usage: own.usage ?? base.usage, storage: own.storage ?? base.storage };
}
