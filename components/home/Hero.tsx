import HeroCarousel, { type HeroSlide } from "./HeroCarousel";

/**
 * Hero — ana sayfa vitrini (ilk ekranı kaplar).
 *
 * Slaytlar veri olarak tanımlanır: kampanya eklemek/çıkarmak için yalnızca bu
 * diziyi düzenlemek yeterli (1 slayt = sabit hero, 2+ slayt = carousel).
 * Kural: her slaytın görseli, başlığı ve CTA'sı aynı şeyi anlatmalı.
 * Görseller: dükkan fotoğrafları/hero klasörü.
 *
 * Fotoğraf slaytları: objectPosition görsel kırpılırken neyin kalacağını belirler (masaüstü) —
 * mobilde görsel ekranın üst kısmında, metin altında durur (objectPositionMobile).
 * Afiş slaytları (metin görselin içinde): artRatio görselin genişlik/yükseklik oranıdır.
 */

const HERO_SLIDES: HeroSlide[] = [
  {
    // Kaynak: dükkan fotoğrafları/hero/500 ml türkiye'de ilk.png (1916×821). Kullanıcı: "Türkiye'de çok nadir
    // bir konsept" — "ilk" iddiası kanıtlanamadığı için metinde "nadir" kullanılır.
    // Şişe görselin solunda (x ≈ %27): yazı sağda, kırpma şişeyi tutar; mobilde şişe + salata üstte görünür.
    id: "sikmali-sise",
    image: "/images/hero/sikmali-zeytinyagi-500ml.jpg",
    imageAlt: "Çiftçi Ece 500 ml sıkmalı şişe soğuk sıkım sızma zeytinyağı; zeytin, salata ve ekmek eşliğinde",
    align: "right",
    objectPosition: "20% center",
    objectPositionMobile: "18% center",
    eyebrow: "Türkiye'de nadir bulunan sıkmalı şişe",
    title: "Zeytinyağını ketçap gibi sıkın",
    accent: "drizzle",
    text: "Soğuk sıkım sızma zeytinyağımız 500 ml sıkmalı şişede. Şişeyi hafifçe sıkın; salataya, kahvaltıya, tavaya damla damla ya da ince bir çizgi hâlinde, tam istediğiniz kadar.",
    highlights: ["Soğuk sıkım sızma", "500 ml sıkmalı şişe", "Orhangazi'de üretildi"],
    primary: { label: "Sıkmalı Şişeyi İncele", href: "/urun/ciftciece-sikmali-sise-zeytinyagi-500ml" },
    secondary: { label: "Tüm zeytinyağları", href: "/kategori/zeytinyagi" },
  },
  {
    id: "zeytinyagi",
    image: "/images/hero/zeytinyagi-hero.jpg",
    imageAlt: "Çiftçi Ece naturel sızma zeytinyağı şişeleri, ahşap raf üzerinde",
    // Şişe görselin solunda: yazı sağa alındı, kırpma şişenin gövdesini (etiket ve yağ) tutar
    align: "right",
    objectPosition: "center 55%",
    objectPositionMobile: "41% center",
    eyebrow: "Orhangazi Zeytinciler Çarşısı",
    title: "Zeytin, Zeytinyağı ve Yöresel Lezzetler",
    text: "Soğuk sıkım sızma zeytinyağı, sofralık zeytin ve yöresel ürünler. Mağazamızın rafındakiler kapınıza gelir.",
    primary: { label: "Ürünleri Keşfet", href: "/urunler" },
    secondary: { label: "Zeytinyağları", href: "/kategori/zeytinyagi" },
  },
  {
    // Hizmet afişi (metin görselin içinde). Sepete eklenen bir ürün değil: "Hizmeti İncele" ana sayfadaki
    // vakumlu paketleme bölümüne (iletişim düğmeleri orada) götürür. Afişin kendi "Ürünleri İncele" düğmesi
    // tıklanmadığı için sitedeki kopyadan silindi; orijinal dosya dükkan fotoğrafları/hero'da duruyor.
    // Görselin sağ/sol kenarı şeffafa yumuşatılmış (webp): geniş ekranlarda kenar boşluğuna dikişsiz karışır.
    id: "vakumlu-paketleme",
    variant: "artwork",
    tone: "light",
    artRatio: 1672 / 941,
    background: "#fefcf8",
    image: "/images/hero/vakumlu-paketleme.webp",
    imageAlt: "Vakumlu paketleme hizmeti: vakumlu ambalajda Çiftçi Ece sofralık siyah zeytin",
    eyebrow: "Hizmetlerimiz",
    title: "Vakumlu Paketleme Hizmeti",
    text: "Siyah zeytinlerimiz tazeliğini, lezzetini ve doğal yapısını koruyan vakumlu ambalajla hazırlanır.",
    note: "Yalnızca siyah zeytin için geçerlidir",
    primary: { label: "Hizmeti İncele", href: "/#vakumlu-paketleme" },
  },
  {
    // Kampanya afişi: metin görselin içinde — üstüne başlık basılmaz.
    // webp: özgün dosyanın çerçeve çizgisi kırpılmış, yan kenarları şeffafa yumuşatılmış hali;
    // arka plan aynı afişten üretilmiş, bulanıklaştırılıp koyulaştırılmış küçük görsel.
    id: "dagli-kestane-sekeri",
    variant: "artwork",
    artRatio: 1499 / 988,
    background: "url(/images/hero/dagli-kestane-sekeri-bg.jpg) center / 100% 100% no-repeat, #2b200d",
    image: "/images/hero/dagli-kestane-sekeri.webp",
    imageAlt: "Dağlı kestane şekerleri kampanya afişi",
    eyebrow: "Yeni gelenler",
    title: "Dağlı Kestane Şekerleri şimdi dükkânımızda",
    text: "Kutu, kase ve kavanoz seçenekleriyle Dağlı kestane şekerleri.",
    primary: { label: "Kestane Şekerlerini İncele", href: "/kategori/kestane-sekeri" },
  },
  {
    id: "zeytin",
    image: "/images/hero/zeytin-agaci.jpg",
    imageAlt: "Çiçek açmış zeytin dalı",
    objectPosition: "72% 40%",
    objectPositionMobile: "72% center",
    eyebrow: "Sofralık Zeytin",
    title: "Sofralık zeytin çeşitlerimiz",
    text: "Gemlik, keramet, kuru sele, kızıl ve kızartılmış zeytin; Çiftçi Ece 1 kg paketlerde.",
    primary: { label: "Zeytinleri İncele", href: "/kategori/zeytin" },
  },
];

export default function Hero() {
  return <HeroCarousel slides={HERO_SLIDES} />;
}
