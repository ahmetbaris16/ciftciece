/**
 * Çiftçi Ece — Katalog verisi (kategoriler, ürünler, yorumlar)
 *
 * Tek kaynak: hem ilk kurulum (prisma/seed.ts) hem de mevcut DB ile
 * karşılaştırma/senkron (prisma/sync-catalog.ts) bu dosyayı kullanır.
 * Görseller yalnızca "dükkan fotoğrafları" klasöründeki gerçek fotoğraflardan
 * türetilmiş dosyalar olmalı. Gerçek fotoğrafı olmayan ürün yayınlanmaz.
 */

// ── Kategori Data ──────────────────────────────────────────────
export const CATEGORIES = [
  {
    id: "cat-zeytinyagi",
    name: "Zeytinyağı",
    slug: "zeytinyagi",
    description: "Çiftçi Ece naturel sızma, soğuk sıkım zeytinyağı; 500 ml sıkmalı şişe, 1 L ve 5 L teneke.",
    imageUrl: "/images/products/zeytinyagi/ciftciece-sizma-1l.jpg",
    sortOrder: 1,
    isPublished: true,
  },
  {
    id: "cat-zeytin",
    name: "Zeytin",
    slug: "zeytin",
    description: "Gemlik, keramet, kuru sele, kızıl ve kızartılmış zeytin; yeşil zeytin çeşitleri.",
    imageUrl: "/images/products/zeytin/ciftciece-gemlik-zeytin-1kg.jpg",
    sortOrder: 2,
    isPublished: true,
  },
  {
    id: "cat-kahvaltilik",
    name: "Kahvaltılık",
    slug: "kahvaltilik",
    description: "Kahvaltılık soslar, közlenmiş ürünler, kurutulmuş domates ve reçel.",
    imageUrl: "/images/products/kahvaltilik/aresto-kahvaltilik-sos.jpg",
    sortOrder: 3,
    isPublished: true,
  },
  {
    id: "cat-tursu",
    name: "Turşu",
    slug: "tursu",
    description: "Gedelek kavanoz turşu çeşitleri.",
    imageUrl: "/images/products/tursu/gedelek-karisik-tursu.jpg",
    sortOrder: 4,
    isPublished: true,
  },
  {
    id: "cat-kestane-sekeri",
    name: "Kestane Şekeri",
    slug: "kestane-sekeri",
    description: "Bülent Dağlı ve Yeşilkent kestane şekerleri.",
    imageUrl: "/images/products/diger/kestane-sekeri-kavanoz.jpg",
    sortOrder: 5,
    isPublished: true,
  },
  {
    id: "cat-sirke-icecek",
    name: "Sirke & İçecek",
    slug: "sirke-icecek",
    description: "Ehlizade sirkeleri ve gilaburu nektarı.",
    imageUrl: "/images/products/diger/elma-sirkesi.jpg",
    sortOrder: 6,
    isPublished: true,
  },
  {
    id: "cat-sabun",
    name: "Sabun",
    slug: "sabun",
    description: "Zeytinyağlı sabun.",
    imageUrl: "/images/products/sabun/5-kalip-zeytinyagli-sabun.jpg",
    sortOrder: 7,
    isPublished: true,
  },
  {
    // Boşaltıldı: ürünler Kahvaltılık / Kestane Şekeri / Sirke & İçecek'e taşındı
    id: "cat-diger",
    name: "Diğer Ürünler",
    slug: "diger",
    description: "",
    imageUrl: null,
    sortOrder: 99,
    isPublished: false,
  },
];

// ── Ürün Data ──────────────────────────────────────────────────
export const PRODUCTS = [
  // ===================== ZEYTİNYAĞI =====================
  // Her boy ayrı ürün kartı (kullanıcı: 5'lik ve sıkmalı listede görünmüyordu). Senkron aracı varyantı SKU ile
  // bulup eski üründen taşır: stok ve sipariş geçmişi korunur.
  {
    name: "Çiftçi Ece Naturel Sızma Zeytinyağı 1 L",
    slug: "naturel-sizma-zeytinyagi",
    description: "Orhangazi'nin tarihi zeytinliklerinden, ilk baskı soğuk sıkım yöntemiyle elde edilen naturel sızma zeytinyağı. Asit oranı %0.8'in altında. Fındık ve çimen notalarıyla kendine özgü aromaya sahip. 1 L cam şişe.",
    categorySlug: "zeytinyagi",
    isPublished: true,
    isFeatured: true,
    sortOrder: 1,
    images: [
      { url: "/images/products/zeytinyagi/ciftciece-sizma-1l.jpg",  altText: "Çiftçi Ece Naturel Sızma Soğuk Sıkım Zeytinyağı 1 L şişesi", sortOrder: 0 },
    ],
    variants: [
      { name: "1 L Cam", sku: "SYAG-1L", priceKurus: 50000, sortOrder: 0, stock: 30 },
    ],
  },
  {
    name: "Naturel Sızma Zeytinyağı 5 L Teneke",
    slug: "naturel-sizma-zeytinyagi-5l",
    description: "Orhangazi'nin zeytinliklerinden, soğuk sıkım naturel sızma zeytinyağı; 5 litrelik teneke ambalajda, aile boyu kullanım için.",
    categorySlug: "zeytinyagi",
    isPublished: true,
    isFeatured: false,
    sortOrder: 2,
    images: [
      { url: "/images/products/zeytinyagi/sizma-zeytinyagi-5l.jpg", altText: "Naturel Sızma Zeytinyağı 5 L teneke", sortOrder: 0 },
    ],
    variants: [
      { name: "5 L Teneke", sku: "SYAG-5L", priceKurus: 250000, sortOrder: 0, stock: 15 },
    ],
  },
  {
    // Fotoğraf: "Çiftçi Ece Sıkmalı Şişe Soğuk Sıkım Sızma Zeytinyağı 500 ml.jpeg". Fiyat listesinde YOK —
    // 289 TL eski kayıttaki fiyat, kullanıcıdan teyit bekliyor.
    name: "Çiftçi Ece Sıkmalı Şişe Soğuk Sıkım Sızma Zeytinyağı 500 ml",
    slug: "ciftciece-sikmali-sise-zeytinyagi-500ml",
    description: "Soğuk sıkım sızma zeytinyağı, kolay dozajlı sıkmalı şişede. Salata ve yemeklerde damla damla kullanım için. 500 ml.",
    categorySlug: "zeytinyagi",
    isPublished: true,
    isFeatured: false,
    sortOrder: 3,
    images: [
      { url: "/images/products/zeytinyagi/ciftciece-sizma-500ml.jpg", altText: "Çiftçi Ece Sıkmalı Şişe Soğuk Sıkım Sızma Zeytinyağı 500 ml", sortOrder: 0 },
    ],
    variants: [
      { name: "500 ml Sıkmalı Şişe", sku: "SYAG-500", priceKurus: 28900, sortOrder: 0, stock: 50 },
    ],
  },

  // ===================== ZEYTİN =====================
  {
    // Siyah/sarı kapaklı kavanozlar iki ayrı ürün: fotoğraflar "Sofralık Zeytin.jpg" (siyah kapak) ve
    // "Sofralık zeytin 2.jpg" (sarı kapak). Fiyatlar kullanıcının listesinden (2026-09-30).
    name: "Çiftçi Ece Sofralık Siyah Zeytin (Siyah Kapak)",
    slug: "ciftciece-sofralik-siyah-zeytin-siyah-kapak",
    description: "Orhangazi'nin dünyaca ünlü siyah zeytininden, Çiftçi Ece etiketli siyah kapaklı kavanozda taze ve lezzetli. Balık etli, yağlı, çekirdekli.",
    categorySlug: "zeytin",
    isPublished: true,
    isFeatured: true,
    sortOrder: 2,
    images: [
      { url: "/images/products/zeytin/ciftciece-sofralik-siyah-zeytin-siyah-kapak.jpg", altText: "Çiftçi Ece Sofralık Siyah Zeytin, siyah kapaklı kavanoz", sortOrder: 0 },
    ],
    variants: [
      { name: "Kavanoz", sku: "SYZ-SIYAH", priceKurus: 35000, sortOrder: 0, stock: 60 },
    ],
  },
  {
    name: "Çiftçi Ece Sofralık Siyah Zeytin (Sarı Kapak)",
    slug: "ciftciece-sofralik-siyah-zeytin-sari-kapak",
    description: "Orhangazi'nin siyah zeytininden, Çiftçi Ece etiketli sarı kapaklı kavanozda taze ve lezzetli sofralık zeytin.",
    categorySlug: "zeytin",
    isPublished: true,
    isFeatured: false,
    sortOrder: 2,
    images: [
      { url: "/images/products/zeytin/ciftciece-sofralik-siyah-zeytin-sari-kapak.jpg", altText: "Çiftçi Ece Sofralık Siyah Zeytin, sarı kapaklı kavanoz", sortOrder: 0 },
    ],
    variants: [
      { name: "Kavanoz", sku: "SYZ-SARI", priceKurus: 20000, sortOrder: 0, stock: 40 },
    ],
  },
  // Vakumlu 2 kg paket ürün olarak satılmıyor (fiyat listesinde yok) — ürün kaydı kaldırıldı
  // (REMOVED_PRODUCT_SLUGS). Paketin fotoğrafı ana sayfadaki "Vakumlu Paketleme Hizmeti" bölümünde
  // hizmet görseli olarak kullanılıyor: components/home/VacuumService.tsx
  {
    name: "Gemlik Siyah Zeytin",
    slug: "gemlik-siyah-zeytin",
    description: "Gemlik'in özgün zeytininden, ince kabuklu, yağlı ve aromalı sofralık siyah zeytin.",
    categorySlug: "zeytin",
    isPublished: true,
    isFeatured: false,
    sortOrder: 3,
    images: [
      { url: "/images/products/zeytin/ciftciece-gemlik-zeytin-1kg.jpg", altText: "Çiftçi Ece Gemlik Zeytin 1 kg", sortOrder: 0 },
    ],
    variants: [
      { name: "1 kg", sku: "GMZ-1KG", priceKurus: 50000, sortOrder: 0, stock: 25 },
    ],
  },
  {
    name: "Keramet Zeytini",
    slug: "keramet-zeytini",
    description: "Seçkin keramet çeşidi sofralık zeytin. Dolgun ve lezzetli.",
    categorySlug: "zeytin",
    isPublished: true,
    isFeatured: false,
    sortOrder: 4,
    images: [
      { url: "/images/products/zeytin/ciftciece-keramet-zeytini-1kg.jpg", altText: "Çiftçi Ece Keramet Zeytini 1 kg", sortOrder: 0 },
    ],
    variants: [
      { name: "1 kg", sku: "KRZ-1KG", priceKurus: 45000, sortOrder: 0, stock: 20 },
    ],
  },
  {
    name: "Kuru Sele Siyah Zeytin",
    slug: "kuru-sele-siyah-zeytin",
    description: "Geleneksel yöntemle tuzlanmış, selede bekletilmiş buruşuk siyah zeytin. Yoğun lezzet.",
    categorySlug: "zeytin",
    isPublished: true,
    isFeatured: false,
    sortOrder: 5,
    images: [
      { url: "/images/products/zeytin/ciftciece-kuru-sele-zeytin-1kg.jpg", altText: "Çiftçi Ece Kuru Sele Siyah Zeytin 1 kg", sortOrder: 0 },
    ],
    variants: [
      { name: "1 kg", sku: "KRSz-1KG", priceKurus: 45000, sortOrder: 0, stock: 20 },
    ],
  },
  {
    name: "Kızıl Zeytin",
    slug: "kizil-zeytin",
    description: "Henüz tam siyaha dönmeden hasat edilen kızıl zeytin. Dengeli aroması ve çıtırlığıyla öne çıkar.",
    categorySlug: "zeytin",
    isPublished: true,
    isFeatured: false,
    sortOrder: 6,
    images: [
      { url: "/images/products/zeytin/ciftciece-kizil-zeytin-1kg.jpg", altText: "Çiftçi Ece Kızıl Zeytin 1 kg", sortOrder: 0 },
    ],
    variants: [
      { name: "1 kg", sku: "KZZ-1KG", priceKurus: 40000, sortOrder: 0, stock: 20 },
    ],
  },
  {
    name: "Aymis Ev Kırma Yeşil Zeytin 400 g",
    slug: "aymis-kirma-yesil-zeytin",
    description: "Zeytinin çekirdeğini çatlattıktan sonra baharatlı suya yatırılan kırma yeşil zeytin. Çıtır ve aromalı.",
    categorySlug: "zeytin",
    isPublished: true,
    isFeatured: false,
    sortOrder: 7,
    images: [
      { url: "/images/products/zeytin/aymis-kirma-yesil-zeytin.jpg", altText: "Aymis Ev Kırma Yeşil Zeytin 400 g", sortOrder: 0 },
    ],
    variants: [
      { name: "400 g Kavanoz", sku: "AYM-KRM-400", priceKurus: 30000, sortOrder: 0, stock: 40 },
    ],
  },
  {
    name: "Aymis Jalapeno Dolgulu Yeşil Zeytin 400 g",
    slug: "aymis-jalapeno-yesil-zeytin",
    description: "İçi jalapeno biberle doldurulmuş yeşil zeytin. Baharatlı sofra keyfi.",
    categorySlug: "zeytin",
    isPublished: true,
    isFeatured: false,
    sortOrder: 8,
    images: [
      { url: "/images/products/zeytin/aymis-jalapeno-yesil-zeytin.jpg", altText: "Aymis Jalapeno Dolgulu Yeşil Zeytin 400 g", sortOrder: 0 },
    ],
    variants: [
      { name: "400 g Kavanoz", sku: "AYM-JLP-400", priceKurus: 25000, sortOrder: 0, stock: 35 },
    ],
  },
  {
    name: "Aymis Limon Dolgulu Yeşil Zeytin 400 g",
    slug: "aymis-limon-yesil-zeytin",
    description: "İçi limon aromalı dolguyla hazırlanmış yeşil zeytin. Ferahlatıcı tadıyla kahvaltı sofrasının vazgeçilmezi.",
    categorySlug: "zeytin",
    isPublished: true,
    isFeatured: true,
    sortOrder: 9,
    images: [
      { url: "/images/products/zeytin/aymis-limon-yesil-zeytin.jpg", altText: "Aymis Limon Dolgulu Yeşil Zeytin 400 g", sortOrder: 0 },
    ],
    variants: [
      { name: "400 g Kavanoz", sku: "AYM-LMN-400", priceKurus: 40000, sortOrder: 0, stock: 35 },
    ],
  },
  {
    name: "Aymis Çizik Yeşil Zeytin 400 g",
    slug: "aymis-cizik-yesil-zeytin",
    description: "Yüzeyi çizilerek baharatın içine işlediği çizik yeşil zeytin. Geleneksel hazırlanış.",
    categorySlug: "zeytin",
    isPublished: true,
    isFeatured: false,
    sortOrder: 10,
    images: [
      { url: "/images/products/zeytin/aymis-cizik-yesil-zeytin.jpg", altText: "Aymis Çizik Yeşil Zeytin 400 g", sortOrder: 0 },
    ],
    variants: [
      { name: "400 g Kavanoz", sku: "AYM-CZK-400", priceKurus: 30000, sortOrder: 0, stock: 40 },
    ],
  },

  // ===================== SABUN =====================
  {
    name: "5 Kalıp Zeytinyağlı Sabun",
    slug: "zeytinyagi-sabun", // URL sabit kalsın diye eski slug korunuyor
    description: "Zeytinyağı ile hazırlanmış 5 kalıp sabun, tek paket halinde. Mağazamızda satılan paketin aynısıdır.",
    categorySlug: "sabun",
    isPublished: true,
    isFeatured: true,
    sortOrder: 11,
    images: [
      { url: "/images/products/sabun/5-kalip-zeytinyagli-sabun.jpg", altText: "5 kalıp zeytinyağlı sabun paketi", sortOrder: 0 },
    ],
    variants: [
      // Gerçek ürün/fiyat: 5 kalıp = 400 TL
      { name: "5 Kalıp", sku: "SAB-ZY-5K", priceKurus: 40000, sortOrder: 0, stock: 50 },
    ],
  },

  // ===================== TURŞU (Gedelek Marka) =====================
  {
    name: "Gedelek Acur Turşusu",
    slug: "gedelek-acur-tursusu",
    description: "Geleneksel ev yapımı yöntemiyle hazırlanmış Gedelek acur turşusu. Sirke ve tuz dengesinde.",
    categorySlug: "tursu",
    isPublished: true,
    isFeatured: false,
    sortOrder: 12,
    images: [
      { url: "/images/products/tursu/gedelek-acur-tursusu.jpg", altText: "Gedelek Acur Turşusu", sortOrder: 0 },
    ],
    variants: [{ name: "720 ml Kavanoz", sku: "TRS-GDLK-ACR-720", priceKurus: 22000, sortOrder: 0, stock: 35 }],
  },
  {
    name: "Gedelek Bamya Turşusu",
    slug: "gedelek-bamya-tursusu",
    description: "Taze bamyadan yapılan, nadir bulunan yöresel Gedelek turşusu.",
    categorySlug: "tursu",
    isPublished: true,
    isFeatured: false,
    sortOrder: 13,
    images: [
      { url: "/images/products/tursu/gedelek-bamya-tursusu.jpg", altText: "Gedelek Bamya Turşusu", sortOrder: 0 },
    ],
    variants: [{ name: "720 ml Kavanoz", sku: "TRS-GDLK-BMY-720", priceKurus: 35000, sortOrder: 0, stock: 25 }],
  },
  {
    // Fotoğraf "Gedelek Acı Biber Turşusu.jpg" (ince acı biberler). URL sabit kalsın diye eski slug korunuyor.
    name: "Gedelek Acı Biber Turşusu",
    slug: "gedelek-biber-tursusu",
    description: "İnce acı biberlerden yapılan Gedelek turşusu. Sofraya baharatlı bir tat katar.",
    categorySlug: "tursu",
    isPublished: true,
    isFeatured: false,
    sortOrder: 14,
    images: [
      { url: "/images/products/tursu/gedelek-biber-tursusu.jpg", altText: "Gedelek Acı Biber Turşusu", sortOrder: 0 },
    ],
    variants: [{ name: "720 ml Kavanoz", sku: "TRS-GDLK-BBR-720", priceKurus: 25000, sortOrder: 0, stock: 30 }],
  },
  {
    name: "Gedelek Karışık Sofralık Turşu",
    slug: "gedelek-karisik-sofralik-tursu",
    description: "Birden fazla sebzeden oluşan, sofra zenginliği yaratan Gedelek karışık turşu.",
    categorySlug: "tursu",
    isPublished: true,
    isFeatured: true,
    sortOrder: 15,
    images: [
      { url: "/images/products/tursu/gedelek-karisik-tursu.jpg", altText: "Gedelek Karışık Sofralık Turşu", sortOrder: 0 },
    ],
    variants: [{ name: "720 ml Kavanoz", sku: "TRS-GDLK-KRS-720", priceKurus: 23000, sortOrder: 0, stock: 40 }],
  },
  {
    name: "Gedelek Mor Lahana Turşusu",
    slug: "gedelek-mor-lahana-tursusu",
    description: "Mor lahanadan yapılan, rengi ve lezzetiyle sofranıza renk katan Gedelek turşusu.",
    categorySlug: "tursu",
    isPublished: true,
    isFeatured: false,
    sortOrder: 16,
    images: [
      { url: "/images/products/tursu/gedelek-mor-lahana-tursusu.jpg", altText: "Gedelek Mor Lahana Turşusu", sortOrder: 0 },
    ],
    variants: [{ name: "720 ml Kavanoz", sku: "TRS-GDLK-MLH-720", priceKurus: 23000, sortOrder: 0, stock: 30 }],
  },
  {
    name: "Gedelek Salatalık Turşusu",
    slug: "gedelek-salatalik-tursusu",
    description: "Çıtır dokusunu koruyan yöntemle hazırlanmış Gedelek salatalık turşusu.",
    categorySlug: "tursu",
    isPublished: true,
    isFeatured: false,
    sortOrder: 17,
    images: [
      { url: "/images/products/tursu/gedelek-salatalik-tursusu.jpg", altText: "Gedelek Salatalık Turşusu", sortOrder: 0 },
    ],
    variants: [{ name: "720 ml Kavanoz", sku: "TRS-GDLK-SLT-720", priceKurus: 23000, sortOrder: 0, stock: 30 }],
  },
  {
    name: "Gedelek Sarımsak Turşusu",
    slug: "gedelek-sarimsak-tursusu",
    description: "Bütün sarımsaktan yapılan, kokusu ve lezzetiyle öne çıkan Gedelek turşusu.",
    categorySlug: "tursu",
    isPublished: true,
    isFeatured: false,
    sortOrder: 18,
    images: [
      { url: "/images/products/tursu/gedelek-sarimsak-tursusu.jpg", altText: "Gedelek Sarımsak Turşusu", sortOrder: 0 },
    ],
    variants: [{ name: "500 ml Kavanoz", sku: "TRS-GDLK-SRM-500", priceKurus: 30000, sortOrder: 0, stock: 25 }],
  },
  {
    name: "Gedelek Taze Fasulye Turşusu",
    slug: "gedelek-fasulye-tursusu",
    description: "Taze yeşil fasulyeden yapılan çıtır Gedelek turşusu.",
    categorySlug: "tursu",
    isPublished: true,
    isFeatured: false,
    sortOrder: 19,
    images: [
      { url: "/images/products/tursu/gedelek-fasulye-tursusu.jpg", altText: "Gedelek Taze Fasulye Turşusu", sortOrder: 0 },
    ],
    variants: [{ name: "720 ml Kavanoz", sku: "TRS-GDLK-FSL-720", priceKurus: 25000, sortOrder: 0, stock: 25 }],
  },
  // Gedelek Tombul Biber Turşusu fiyat listesinde olmadığı için kaldırıldı (REMOVED_PRODUCT_SLUGS).
  {
    name: "Gedelek Acılı Kiraz Biberi Turşusu",
    slug: "gedelek-acili-kiraz-biberi-tursusu",
    description: "Küçük ve acı kiraz biberinden yapılan, damaklarda iz bırakan Gedelek turşusu.",
    categorySlug: "tursu",
    isPublished: true,
    isFeatured: false,
    sortOrder: 21,
    images: [
      { url: "/images/products/tursu/gedelek-acili-kiraz-biber-tursusu.jpg", altText: "Gedelek Acılı Kiraz Biberi Turşusu", sortOrder: 0 },
    ],
    variants: [{ name: "720 ml Kavanoz", sku: "TRS-GDLK-AKB-720", priceKurus: 25000, sortOrder: 0, stock: 20 }],
  },
  {
    name: "Gedelek Lahana Turşusu",
    slug: "gedelek-lahana-tursusu",
    description: "Beyaz lahanadan yapılan, ekşimsi ve çıtır Gedelek lahana turşusu.",
    categorySlug: "tursu",
    isPublished: true,
    isFeatured: false,
    sortOrder: 22,
    images: [
      { url: "/images/products/tursu/gedelek-lahana-tursusu.jpg", altText: "Gedelek Lahana Turşusu", sortOrder: 0 },
    ],
    variants: [{ name: "720 ml Kavanoz", sku: "TRS-GDLK-LHN-720", priceKurus: 22000, sortOrder: 0, stock: 30 }],
  },
  {
    // Fotoğraf: "Gedelek Patlıcan Dolma Turşusu.png" (2026-09-30, kullanıcı ekledi). Fiyat listesinden: 350 TL.
    // Kavanoz boyu etikette/listede yazmadığı için varyant adı "Kavanoz" (diğer Gedelek kavanozları 720 ml).
    name: "Gedelek Patlıcan Dolma Turşusu",
    slug: "gedelek-patlican-dolma-tursusu",
    description: "İple bağlanmış patlıcan dolmaları, kırmızı biber ve sarımsakla kavanozda hazırlanan Gedelek patlıcan dolma turşusu.",
    categorySlug: "tursu",
    isPublished: true,
    isFeatured: false,
    sortOrder: 22,
    images: [
      { url: "/images/products/tursu/gedelek-patlican-dolma-tursusu.jpg", altText: "Gedelek Patlıcan Dolma Turşusu", sortOrder: 0 },
    ],
    variants: [{ name: "Kavanoz", sku: "TRS-GDLK-PTD", priceKurus: 35000, sortOrder: 0, stock: 20 }],
  },

  // ===================== KAHVALTILIK & MEZELER =====================
  {
    name: "Aresto Kahvaltılık Sos",
    slug: "aresto-kahvaltilik-sos",
    description: "Özel baharat karışımıyla hazırlanmış, kahvaltı sofralarını zenginleştiren Aresto sos.",
    categorySlug: "kahvaltilik",
    isPublished: true,
    isFeatured: true,
    sortOrder: 23,
    images: [
      { url: "/images/products/kahvaltilik/aresto-kahvaltilik-sos.jpg", altText: "Aresto Kahvaltılık Sos", sortOrder: 0 },
    ],
    variants: [{ name: "Standart", sku: "KHV-ARST", priceKurus: 25000, sortOrder: 0, stock: 40 }],
  },
  {
    // Kullanıcı listesinde "Lütenitsa 250 gram: 150 TL" — fotoğraftaki ürün 275 g (etikette NET 275 g).
    name: "Rifat Minare Lütenitsa Kahvaltılık Sos",
    slug: "rifat-minare-lutenitsa",
    description: "Közlenmiş biber ve domatesin buluşmasından oluşan geleneksel Balkan lezzeti Lütenitsa. 275 g.",
    categorySlug: "kahvaltilik",
    isPublished: true,
    isFeatured: true,
    sortOrder: 24,
    images: [
      { url: "/images/products/kahvaltilik/rifat-minare-lutenitsa.jpg", altText: "Rifat Minare Lütenitsa 275 g", sortOrder: 0 },
    ],
    variants: [{ name: "275 g", sku: "KHV-RFM-LTN-275", priceKurus: 15000, sortOrder: 0, stock: 35 }],
  },
  {
    // "Lütenitsa 530 gram: 250 TL" — 530 g'lık fotoğraf Acı Lütenitsa'ya ait (etikette "ACI SOS", NET 530 g).
    name: "Rifat Minare Acı Lütenitsa Kahvaltılık Sos",
    slug: "rifat-minare-aci-lutenitsa",
    description: "Acı biberli versiyonuyla daha yoğun lezzetli Lütenitsa sos. 530 g.",
    categorySlug: "kahvaltilik",
    isPublished: true,
    isFeatured: false,
    sortOrder: 25,
    images: [
      { url: "/images/products/kahvaltilik/rifat-minare-aci-lutenitsa.jpg", altText: "Rifat Minare Acı Lütenitsa 530 g", sortOrder: 0 },
    ],
    variants: [{ name: "530 g", sku: "KHV-RFM-ALT-530", priceKurus: 25000, sortOrder: 0, stock: 25 }],
  },
  {
    name: "Rifat Minare Közlenmiş Biber",
    slug: "rifat-minare-kozlenmis-biber",
    description: "Ateşte közlenmiş, soyulmuş kırmızı biber. 1020 g (Süzme 700 g). Meze, salata ve yemeklerde kullanım.",
    categorySlug: "kahvaltilik",
    isPublished: true,
    isFeatured: false,
    sortOrder: 26,
    images: [
      { url: "/images/products/kahvaltilik/rifat-minare-kozlenmis-biber.jpg", altText: "Rifat Minare Közlenmiş Biber 1020 g", sortOrder: 0 },
    ],
    variants: [{ name: "1020 g", sku: "KHV-RFM-KZB-1020", priceKurus: 30000, sortOrder: 0, stock: 25 }],
  },
  {
    name: "Rifat Minare Közlenmiş Patlıcan Salatası",
    slug: "rifat-minare-patlican-salatasi",
    description: "Közlenmiş patlıcandan hazırlanan otantik Balkan patlıcan salatası. 370 g.",
    categorySlug: "kahvaltilik",
    isPublished: true,
    isFeatured: false,
    sortOrder: 27,
    images: [
      { url: "/images/products/kahvaltilik/rifat-minare-patlican-salatasi.jpg", altText: "Rifat Minare Közlenmiş Patlıcan Salatası 370 g", sortOrder: 0 },
    ],
    variants: [{ name: "370 g", sku: "KHV-RFM-PTS-370", priceKurus: 35000, sortOrder: 0, stock: 30 }],
  },
  {
    name: "Rifat Minare Salamura Enginar",
    slug: "rifat-minare-salamura-enginar",
    description: "Salamura yöntemiyle hazırlanmış narin enginar. Meze olarak ya da yemeklerde kullanım. 520 g.",
    categorySlug: "kahvaltilik",
    isPublished: true,
    isFeatured: false,
    sortOrder: 28,
    images: [
      { url: "/images/products/kahvaltilik/rifat-minare-salamura-enginar.jpg", altText: "Rifat Minare Salamura Enginar 520 g", sortOrder: 0 },
    ],
    variants: [{ name: "520 g", sku: "KHV-RFM-ENG-520", priceKurus: 35000, sortOrder: 0, stock: 20 }],
  },
  {
    // Fotoğraflar: "Tuzcu ... Domates 390g.jpg" ve "... 720g (1).jpg". Kullanıcı listesinde 720 g'nin fiyatı boş,
    // "Büyük Kavanoz: 500 TL" satırı 720 g ürününe eşlendi. İki boy ayrı ürün kartıdır.
    name: "Tuzcu Yağda Marine Güneşte Kurutulmuş Domates 390 g",
    slug: "yagda-marine-kurutulmus-domates",
    description: "Güneşte kurutulmuş domateslerin zeytinyağında marine edilmesiyle elde edilen eşsiz lezzet. 390 g kavanoz.",
    categorySlug: "kahvaltilik",
    isPublished: true,
    isFeatured: true,
    sortOrder: 29,
    images: [
      { url: "/images/products/kahvaltilik/marine-kurutulmus-domates.jpg", altText: "Tuzcu Yağda Marine Güneşte Kurutulmuş Domates 390 g", sortOrder: 0 },
    ],
    variants: [
      { name: "390 g", sku: "KHV-TZC-KRD-390", priceKurus: 30000, sortOrder: 0, stock: 30 },
    ],
  },
  {
    name: "Tuzcu Yağda Marine Güneşte Kurutulmuş Domates 720 g (Büyük Kavanoz)",
    slug: "yagda-marine-kurutulmus-domates-720g",
    description: "Güneşte kurutulmuş domateslerin zeytinyağında marine edilmesiyle elde edilen eşsiz lezzet. 720 g büyük kavanoz.",
    categorySlug: "kahvaltilik",
    isPublished: true,
    isFeatured: false,
    sortOrder: 29,
    images: [
      { url: "/images/products/kahvaltilik/kurutulmus-domates-2.jpg", altText: "Tuzcu Yağda Marine Güneşte Kurutulmuş Domates 720 g büyük kavanoz", sortOrder: 0 },
    ],
    variants: [
      { name: "720 g Büyük Kavanoz", sku: "KHV-TZC-KRD-720", priceKurus: 50000, sortOrder: 0, stock: 20 },
    ],
  },

  // ===================== DİĞER ÜRÜNLER =====================
  // Bal satılmıyor (kullanıcı kararı, 2026-09-30): ürün, görsel ve kategori metinlerinden tamamen çıkarıldı.
  // Birleşik "Dağlı Kestane Şekeri" kaydı (aynı üç fotoğraf ve fiyat, 3 varyantlı) kullanıcı kararıyla kaldırıldı
  // (REMOVED_PRODUCT_SLUGS): aşağıdaki tekil "Bülent Dağlı" ürünleri (225 g 300 TL, 450 g 550 TL, kavanoz 425 TL) kalıyor.
  {
    name: "Ehlizade Cevizli İncir Reçeli 350 g",
    slug: "ehlizade-cevizli-incir-receli",
    description: "Taze incirin cevizle buluştuğu, geleneksel yöntemle pişirilen doğal reçel. 350 g.",
    categorySlug: "kahvaltilik",
    isPublished: true,
    isFeatured: true,
    sortOrder: 34,
    images: [
      { url: "/images/products/diger/cevizli-incir-receli.jpg", altText: "Ehlizade Cevizli İncir Reçeli 350 g", sortOrder: 0 },
    ],
    variants: [{ name: "350 g", sku: "DGR-EHL-CIR-350", priceKurus: 40000, sortOrder: 0, stock: 35 }],
  },
  {
    name: "Ehlizade Yeşil İncir Reçeli 350 g",
    slug: "ehlizade-yesil-incir-receli",
    description: "Yeşil incirden yapılan, hafif tatlı dengeli reçel. 350 g.",
    categorySlug: "kahvaltilik",
    isPublished: true,
    isFeatured: false,
    sortOrder: 35,
    images: [
      { url: "/images/products/diger/yesil-incir-receli.jpg", altText: "Ehlizade Yeşil İncir Reçeli 350 g", sortOrder: 0 },
    ],
    variants: [{ name: "350 g", sku: "DGR-EHL-YIR-350", priceKurus: 40000, sortOrder: 0, stock: 30 }],
  },
  {
    name: "Ehlizade Alıç Sirkesi 500 ml",
    slug: "ehlizade-alic-sirkesi",
    description: "Doğal alıç meyvesinden üretilen, sindirimi kolaylaştıran ve antioksidan açısından zengin sirke. 500 ml.",
    categorySlug: "sirke-icecek",
    isPublished: true,
    isFeatured: false,
    sortOrder: 36,
    images: [
      { url: "/images/products/diger/alic-sirkesi.jpg", altText: "Ehlizade Alıç Sirkesi 500 ml", sortOrder: 0 },
    ],
    variants: [{ name: "500 ml", sku: "DGR-EHL-ALS-500", priceKurus: 30000, sortOrder: 0, stock: 30 }],
  },
  {
    name: "Ehlizade Ananas Sirkesi 500 ml",
    slug: "ehlizade-ananas-sirkesi",
    description: "Ananastan üretilen, ekzotik aromalı doğal sirke. 500 ml.",
    categorySlug: "sirke-icecek",
    isPublished: true,
    isFeatured: false,
    sortOrder: 37,
    images: [
      { url: "/images/products/diger/ananas-sirkesi.jpg", altText: "Ehlizade Ananas Sirkesi 500 ml", sortOrder: 0 },
    ],
    variants: [{ name: "500 ml", sku: "DGR-EHL-ANS-500", priceKurus: 30000, sortOrder: 0, stock: 25 }],
  },
  {
    name: "Ehlizade Elma Sirkesi 500 ml",
    slug: "ehlizade-elma-sirkesi",
    description: "Doğal elma fermentasyonuyla üretilen, sağlıklı ve lezzetli elma sirkesi. 500 ml.",
    categorySlug: "sirke-icecek",
    isPublished: true,
    isFeatured: false,
    sortOrder: 38,
    images: [
      { url: "/images/products/diger/elma-sirkesi.jpg", altText: "Ehlizade Elma Sirkesi 500 ml", sortOrder: 0 },
    ],
    variants: [{ name: "500 ml", sku: "DGR-EHL-ELS-500", priceKurus: 30000, sortOrder: 0, stock: 35 }],
  },
  {
    name: "Herbal Palace Organik Gilaburu Nektarı 1 L",
    slug: "herbal-palace-gilaburu-nektari",
    description: "Anadolu'nun şifalı meyvesi gilaburudan soğuk sıkım yöntemiyle üretilen organik nektar. 1 L.",
    categorySlug: "sirke-icecek",
    isPublished: true,
    isFeatured: true,
    sortOrder: 39,
    images: [
      { url: "/images/products/diger/gilaburu-nektari.jpg", altText: "Herbal Palace Organik Gilaburu Nektarı 1 L", sortOrder: 0 },
    ],
    variants: [{ name: "1 L", sku: "DGR-HBP-GLB-1L", priceKurus: 35000, sortOrder: 0, stock: 20 }],
  },

  // ---- Bülent Dağlı (admin'den eklenmişti; kataloğa DB'deki hâliyle alındı) ----
  {
    name: "Bülent Dağlı Bütün Kestane Şekeri 225 g",
    slug: "bulent-dagli-kestane-sekeri-225g",
    description: "Bütün kestaneden yapılan, şekerli şurupta bekletilmiş otantik Türk kestane şekeri. 225 g.",
    categorySlug: "kestane-sekeri",
    isPublished: true,
    isFeatured: false,
    sortOrder: 31,
    images: [
      { url: "/images/products/diger/kestane-sekeri-225g.jpg", altText: "Bülent Dağlı Bütün Kestane Şekeri 225 g", sortOrder: 0 },
    ],
    variants: [
      // Fotoğraf = "Dağlı Duble Kestane Şekeri Plastik Kutu 250 g" (brüt 250 g / net 225 g) → listede 300 TL
      { name: "225 g", sku: "DGR-KST-225", priceKurus: 30000, sortOrder: 0, stock: 30 },
    ],
  },
  {
    name: "Bülent Dağlı Bütün Kestane Şekeri 450 g",
    slug: "bulent-dagli-kestane-sekeri-450g",
    description: "Bütün kestaneden yapılan, şekerli şurupta bekletilmiş otantik Türk kestane şekeri. 450 g.",
    categorySlug: "kestane-sekeri",
    isPublished: true,
    isFeatured: false,
    sortOrder: 32,
    images: [
      { url: "/images/products/diger/kestane-sekeri-450g.jpg", altText: "Bülent Dağlı Bütün Kestane Şekeri 450 g", sortOrder: 0 },
    ],
    variants: [
      // Fotoğraf = "Dağlı Duble Kestane Şekeri Plastik Kutu 500 g" (brüt 500 g / net 450 g) → listede 550 TL
      { name: "450 g", sku: "DGR-KST-450", priceKurus: 55000, sortOrder: 0, stock: 20 },
    ],
  },
  {
    name: "Bülent Dağlı Kavanoz Kestane Şekeri",
    slug: "bulent-dagli-kavanoz-kestane-sekeri",
    description: "Kavanozda şurupta bekletilmiş kestane şekeri. Hediye kutusuna da uygun.",
    categorySlug: "kestane-sekeri",
    isPublished: true,
    isFeatured: true,
    sortOrder: 33,
    images: [
      { url: "/images/products/diger/kestane-sekeri-kavanoz.jpg", altText: "Bülent Dağlı Kavanoz Kestane Şekeri", sortOrder: 0 },
    ],
    variants: [
      // Fotoğraf = "Dağlı Şuruplu Kavanoz Kestane Şekeri 500 g" → listede 425 TL
      { name: "Kavanoz", sku: "DGR-KST-KVN", priceKurus: 42500, sortOrder: 0, stock: 25 },
    ],
  },

  // ===================== YENİ ÜRÜNLER (Gerçek İşletme Verileri) =====================

  // Kestanelen, İnci Kestane Şekeri, genel "Sirke" ve "Kuru Domates" taslakları fiyat listesinde olmadığı
  // (ve fotoğrafları da olmadığı) için kaldırıldı (REMOVED_PRODUCT_SLUGS).

  // ---- Yeşilkent (250 g ve 500 g ayrı ürün kartı) ----
  // 1 kg (YSLKNT-1KG) fiyat listesinde olmadığı için 2026-09-30'da kaldırıldı → REMOVED_VARIANT_SKUS
  {
    name: "Yeşilkent Kestane Şekeri 250 g",
    slug: "yesilkent-kestane-sekeri",
    description: "Yeşilkent marka kestane şekeri, 250 g.",
    categorySlug: "kestane-sekeri",
    isPublished: true,
    isFeatured: false,
    sortOrder: 41,
    images: [
      { url: "/images/products/kestane/yesilkent-kestane-sekeri-250g.jpg", altText: "Yeşilkent Kestane Şekeri 250 g", sortOrder: 0 },
    ],
    variants: [
      { name: "250 g", sku: "YSLKNT-250", priceKurus: 25000, sortOrder: 0, stock: 30 },
    ],
  },
  {
    name: "Yeşilkent Kestane Şekeri 500 g",
    slug: "yesilkent-kestane-sekeri-500g",
    description: "Yeşilkent marka kestane şekeri, 500 g.",
    categorySlug: "kestane-sekeri",
    isPublished: true,
    isFeatured: false,
    sortOrder: 41,
    images: [
      { url: "/images/products/kestane/yesilkent-kestane-sekeri-500g.jpg", altText: "Yeşilkent Kestane Şekeri 500 g", sortOrder: 0 },
    ],
    variants: [
      { name: "500 g", sku: "YSLKNT-500", priceKurus: 35000, sortOrder: 0, stock: 25 },
    ],
  },

  // ---- Kavanoz Yeşil Zeytin ----
  {
    name: "Kavanoz Yeşil Zeytin",
    slug: "kavanoz-yesil-zeytin",
    description: "Kavanozda salamura yeşil zeytin. Sofralık.",
    categorySlug: "zeytin",
    isPublished: false, // gerçek fotoğrafı yok — fotoğraf eklenince yayına alınır
    isFeatured: false,
    sortOrder: 43,
    images: [

    ],
    variants: [
      { name: "Kavanoz", sku: "ZYT-KVZ-YSL", priceKurus: 20000, sortOrder: 0, stock: 30 },
    ],
  },

  // ---- Izgara Zeytin ----
  {
    name: "Çiftçi Ece Kızartılmış (Izgara) Zeytin",
    slug: "izgara-zeytin",
    description: "Kızartılmış (ızgara) yeşil zeytin, 1 kg paket.",
    categorySlug: "zeytin",
    isPublished: true,
    isFeatured: false,
    sortOrder: 44,
    images: [
      { url: "/images/products/zeytin/ciftciece-kizartilmis-zeytin-1kg.jpg", altText: "Çiftçi Ece Kızartılmış Zeytin 1 kg", sortOrder: 0 },
    ],
    variants: [
      { name: "Standart", sku: "ZYT-IZGR", priceKurus: 40000, sortOrder: 0, stock: 25 },
    ],
  },


  // ===================== ÇÖZÜLEN ÜRÜN =====================
  // "Gülten hiç sağ 275 gram 150 TL" (sesli yazım hatası) = Rifat Minare Lütenitsa 275 g, 150 TL.
  // Kullanıcının 2026-09-30 listesindeki "Lütenitsa 250 gram: 150 tl" satırıyla doğrulandı (yukarıda uygulandı).

  // ===================== LİSTEDE OLUP SİTEDE OLMAYANLAR =====================
  // Kullanıcının fiyat listesinde (2026-09-30) olup sitede karşılığı bulunamayanlar:
  //  - Kavanoz Yeşil Zeytin: 200 TL — yukarıda kayıtlı ama fotoğrafı YOK (yayında değil).
  //  (Gedelek Patlıcan Dolma Turşusu 350 TL: fotoğrafı 2026-09-30'da eklendi, yayında.)
  //  - "Közlenmiş biber: 150 TL" ve "Közlenmiş Patlıcan: 130 TL" satırları, aynı listedeki
  //    "Rifat Minare Közlenmiş Biber 1020 g: 300 TL" / "Közlenmiş Patlıcan Salatası 370 g: 350 TL"
  //    ile çakışıyor. Adı ve gramajı yazılı satırlar (300 / 350) uygulandı. 150 / 130 TL'lik ürünler
  //    farklı (küçük) bir ürünse fotoğrafı YOK.
  //  - Tuzcu 720 g satırının fiyatı boştu; aynı listedeki "Büyük Kavanoz: 500 TL" 720 g'ye eşlendi.
  //  - "Sirkelerin hepsi 300 TL" ve "Reçellerin hepsi 400 TL": Ehlizade sirke (3) ve reçel (2) ürünlerine uygulandı.
  //
  // Sabun (5 Kalıp Zeytinyağlı Sabun, 400 TL) fiyat listesinde yok ama kalıyor — kullanıcı kararı (2026-09-30).
];


// ── Müşteri Yorumları ─────────────────────────────────────────
// Google Haritalar işletme profilinden aktarılan yorumlar (önceki sürümde
// ana sayfada statik gösteriliyordu). Tarihler aktarım sırasında yaklaşık girildi —
// yayında kalmadan önce işletme sahibi Google profilinden teyit etmeli.
// Admin > Yorumlar ekranından gizlenebilir/düzenlenebilir.
export const REVIEWS = [
  { authorName: "Ayşenur", rating: 5, text: "Dağlı kestane şekeri ürünleri alabileceğiniz güler yüzlü sahibi olan dükkan", date: new Date("2026-06-26"), source: "google", sortOrder: 1 },
  { authorName: "Uğur Mestanlar", rating: 5, text: "", date: new Date("2026-06-26"), source: "google", sortOrder: 2 },
  { authorName: "Suat Çiftçi", rating: 5, text: "", date: new Date("2026-06-26"), source: "google", sortOrder: 3 },
];

/**
 * Satıştan kaldırılan ürünler. Senkron aracı: siparişte kullanılmadıysa DB'den
 * siler, kullanıldıysa yayından kaldırır (sipariş geçmişi bozulmasın).
 */
export const REMOVED_PRODUCT_SLUGS = [
  "pismaniye", // 2026-09-29: kullanıcı talebiyle kaldırıldı
  // 2026-09-30: kullanıcının fiyat listesinde olmayanlar çıkarıldı
  "dogal-cicek-bali", // bal satılmayacak (kullanıcı kararı)
  "gedelek-tombul-biber-tursusu",
  "ciftciece-vakumlu-sofralik-siyah-zeytin", // vakum bir hizmet, ürün değil; DB'de siparişi varsa yayından kalkar
  "kestanelen",
  "inci-kestane-sekeri",
  "sirke",
  "kuru-domates",
  // 2026-09-30 (ikinci tur): birleşik Dağlı kaydı — 425 TL'lik tekil "Bülent Dağlı Kavanoz" kalıyor
  "dagli-kestane-sekeri",
];

/**
 * Satıştan kaldırılan varyantlar (SKU). Senkron aracı: siparişte kullanılmadıysa siler
 * (sepetteki satırlarıyla birlikte), kullanıldıysa satışa kapatır. Listede olmayan hiçbir
 * varyanta dokunulmaz.
 */
export const REMOVED_VARIANT_SKUS = [
  // 2026-09-30: fiyat listesinde bu ürünler yalnızca 1 kg olarak var; eski taslak 500 g varyantları
  // (139–159 TL) 1 kg fiyatının çok altında kalıyordu ve ürün kartında ilk varyant olarak görünüyordu.
  "GMZ-500",
  "KRZ-500",
  "KRSz-500",
  "KZZ-500",
  // Acı Lütenitsa'nın gerçek boyu 530 g (etiket + kullanıcı listesi); "300 g" taslaktı → KHV-RFM-ALT-530
  "KHV-RFM-ALT-300",
  // 2026-09-30: fiyat listesinde olmayan varyant (Dağlı 1 kg/Büyük Kutu/Küçük Kutu ürünle birlikte kalktı)
  "YSLKNT-1KG", // Yeşilkent 1 kg
];
