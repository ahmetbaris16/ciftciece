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
 * Geniş afiş (variant "banner", metin ve düğme görselde): artSize görselin pikselleri, ctaBox afişteki çizili
 * düğmenin kutusu — masaüstünde gerçek bağlantı tam oraya konur. Yeni afiş eklenince kutu görselden ölçülür.
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
    // Kaynak: dükkan fotoğrafları/hero/vakum.png (1916×821, 2026-10-07; eski afişin yerine). Metin ve
    // "Ürünleri İncele" düğmesi afişte: masaüstünde çizili düğmenin tam üstüne gerçek bağlantı konur (ctaBox).
    // Hizmet sepete eklenen bir ürün değil: bağlantı ana sayfadaki vakumlu paketleme bölümüne (zeytinler ve
    // iletişim düğmeleri orada) götürür. Kapsam notu (yalnız siyah zeytin) düğmenin altında görünür.
    // webp: kenarları şeffafa yumuşatılmış; boşluklar aynı afişten üretilmiş bulanık zeminle dolar.
    // Mobilde paket görünür, metin altta.
    id: "vakumlu-paketleme",
    variant: "banner",
    tone: "light",
    artSize: [1916, 821],
    ctaBox: { x: 311, y: 650, w: 384, h: 75 },
    background: "url(/images/hero/vakumlu-paketleme-afis-zemin.jpg) center / cover no-repeat, #d9cdbb",
    backgroundMobile: "#f4eee4",
    image: "/images/hero/vakumlu-paketleme-afis.webp",
    imageAlt: "Vakumlu paketleme hizmeti afişi: vakumlu ambalajda Çiftçi Ece sofralık siyah zeytin",
    objectPositionMobile: "78% center",
    eyebrow: "Hizmetlerimiz",
    title: "Vakumlu Paketleme Hizmeti",
    text: "Siyah zeytinlerimiz tazeliğini, lezzetini ve doğal yapısını koruyan vakumlu ambalajla hazırlanır. Daha hijyenik, daha güvenli ve daha uzun ömürlü saklama sunar.",
    note: "Yalnızca siyah zeytin için geçerlidir",
    primary: { label: "Ürünleri İncele", href: "/#vakumlu-paketleme" },
  },
  {
    // Kaynak: dükkan fotoğrafları/hero/kestane_sekeri.png (1916×821, 2026-10-07; eski Dağlı afişinin yerine):
    // Dağlı ve YeşilKent kestane şekerleri. Metin ve düğme afişte (bkz. vakumlu paketleme).
    id: "bursa-kestane-sekeri",
    variant: "banner",
    tone: "light",
    artSize: [1916, 821],
    ctaBox: { x: 116, y: 522, w: 360, h: 77 },
    background: "url(/images/hero/bursa-kestane-sekeri-afis-zemin.jpg) center / cover no-repeat, #e2cdb4",
    backgroundMobile: "#f6efe5",
    image: "/images/hero/bursa-kestane-sekeri-afis.webp",
    imageAlt: "Bursa kestane şekeri afişi: Dağlı ve YeşilKent kestane şekerleri",
    objectPositionMobile: "74% center",
    eyebrow: "Doğal lezzetin en tatlı hâli",
    title: "Bursa Kestane Şekeri Dükkânımızda!",
    text: "Gelenekten gelen eşsiz lezzet, taze hâliyle şimdi mağazamızda ve web sitemizde.",
    primary: { label: "Ürünleri İncele", href: "/kategori/kestane-sekeri" },
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
