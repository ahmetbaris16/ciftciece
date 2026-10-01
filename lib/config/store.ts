/**
 * Çiftçi Ece — Merkezi Mağaza Konfigürasyonu
 *
 * TÜM mağaza bilgisi buradan yönetilir.
 * Hardcode ederek farklı componentlere DAĞITMA.
 * TODO işaretli alanlar kullanıcı tarafından doldurulmalı.
 */

export const STORE = {
  name: "Çiftçi Ece",
  legalName: "Çiftçi Ece", // TODO: Tüzel kişi/işletme tam adı
  tagline: "Zeytin · Zeytinyağı · Doğal Ürünler",
  description:
    "Orhangazi Zeytinciler Çarşısı'ndan sofranıza. Gerçek zeytin, sızma zeytinyağı ve yöresel lezzetler.",

  // İletişim
  contact: {
    phone: "05326825372",
    phoneFormatted: "0532 682 53 72",
    whatsapp: "905326825372",
    email: "TODO",
    instagram: "@ciftciecezeytinleri",
    instagramUrl: "https://www.instagram.com/ciftciecezeytinleri/",
  },

  // Adres — Kullanıcı tarafından verildi
  address: {
    street: "Zeytinciler Çarşısı",
    neighborhood: "Muradiye",
    postalCode: "16800",
    district: "Orhangazi",
    city: "Bursa",
    country: "Türkiye",
    countryCode: "TR",
    full: "Muradiye, Zeytinciler Çarşısı, 16800 Orhangazi/Bursa",
    // Mağazanın konumu: Google Haritalar'daki "Çiftçi ece zeytinleri" işletme kaydının pini
    // (Zeytinciler Çarşısı içinde; kayıttaki adres/telefon/saat bu dosyayla birebir aynı).
    // Eski değer (40.493639, 29.307694) dükkânın ~1,1 km kuzeyine düşüyordu.
    lat: 40.4838317,
    lng: 29.3101452,
    // Google Haritalar'daki işletme kaydının Place ID'si: bağlantılar ham koordinat yerine
    // doğrudan dükkânın kaydını (yorumlar, telefon, saatler) açar.
    googlePlaceId: "ChIJ09dfMwBXyhQRGApzDzseskg",
    // Konum üzerinde Google Haritalar (işletme kaydı)
    googleMapsUrl:
      "https://www.google.com/maps/search/?api=1&query=%C3%87ift%C3%A7i%20ece%20zeytinleri&query_place_id=ChIJ09dfMwBXyhQRGApzDzseskg",
    // Yol tarifi (JS'siz yedek): SADECE destination. Başlangıcı Google seçer — konum izni yoksa
    // Google konumu IP'den TAHMİN eder ve alakasız bir yerden tarif çıkabilir (kullanıcı bunu yaşadı).
    // Sitedeki "Yol Tarifi Al" düğmesi bu yüzden tarayıcıdan gerçek konumu alıp origin olarak verir:
    // bkz. components/store/DirectionsButton.tsx ve buildDirectionsUrl().
    directionsUrl:
      "https://www.google.com/maps/dir/?api=1&destination=40.4838317%2C29.3101452&destination_place_id=ChIJ09dfMwBXyhQRGApzDzseskg",
  },

  // Çalışma saatleri — Kullanıcı tarafından verildi
  // 00:00 = gece yarısı (ertesi gün 00:00 anlamında)
  hours: {
    monday:    { open: "07:00", close: "00:00", isOpen: true },
    tuesday:   { open: "07:00", close: "00:00", isOpen: true },
    wednesday: { open: "07:00", close: "00:00", isOpen: true },
    thursday:  { open: "07:00", close: "00:00", isOpen: true },
    friday:    { open: "07:00", close: "00:00", isOpen: true },
    saturday:  { open: "07:00", close: "00:00", isOpen: true },
    sunday:    { open: "07:00", close: "00:00", isOpen: true },
  } as const,

  // Kargo: eşik ve firma ücretleri DB'de (site_settings "shipping") — admin → Ayarlar → Kargo.
  // Varsayılanlar: lib/shipping/settings.ts
  shipping: {
    currency: "TRY",
  },

  // Ödeme
  payment: {
    currency: "TRY",
    // İyzico entegrasyonu için env variable kullanılır
    // Secret'lar ASLA burada olmaz — sadece server env
    provider: "iyzico" as const,
  },

  // SEO
  seo: {
    siteName: "Çiftçi Ece",
    defaultTitle: "Çiftçi Ece | Zeytin, Zeytinyağı ve Yöresel Ürünler — Orhangazi",
    titleTemplate: "%s | Çiftçi Ece",
    defaultDescription:
      "Orhangazi Zeytinciler Çarşısı'ndan sofranıza. Soğuk sıkım sızma zeytinyağı, sofralık zeytin, turşu ve doğal ürünler.",
    keywords: [
      "orhangazi zeytin",
      "bursa zeytinyağı",
      "sızma zeytinyağı",
      "sofralık zeytin",
      "yöresel turşu",
      "çiftçi ece",
    ],
    ogImage: "/images/hero/zeytinyagi-hero.jpg",
  },

  // Yasal — TODO
  legal: {
    taxNumber: "TODO",
    mersisNo: "TODO",
    tradeRegistryNo: "TODO",
  },
} as const;

// ============================================================
// Yardımcı fonksiyonlar
// ============================================================

/**
 * Belirli bir başlangıçtan dükkâna Google Haritalar yol tarifi bağlantısı.
 * origin: "enlem,boylam" (tarayıcı konumu) ya da müşterinin yazdığı adres.
 */
export function buildDirectionsUrl(origin: string): string {
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination: `${STORE.address.lat},${STORE.address.lng}`,
    destination_place_id: STORE.address.googlePlaceId,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

type DayKey = keyof typeof STORE.hours;

const DAY_MAP: Record<number, DayKey> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

const DAY_TR: Record<DayKey, string> = {
  monday: "Pazartesi",
  tuesday: "Salı",
  wednesday: "Çarşamba",
  thursday: "Perşembe",
  friday: "Cuma",
  saturday: "Cumartesi",
  sunday: "Pazar",
};

/**
 * Mağazanın şu an açık olup olmadığını hesaplar.
 * Gerçek local saat kullanılır — hardcode değil.
 */
export function getStoreStatus(): {
  isOpen: boolean;
  label: string;
  closesAt?: string;
  opensAt?: string;
} {
  const now = new Date();
  const dayKey = DAY_MAP[now.getDay()];
  const todayHours = STORE.hours[dayKey];

  if (!todayHours.isOpen) {
    return { isOpen: false, label: "Bugün kapalı" };
  }

  const [openH, openM] = todayHours.open.split(":").map(Number);
  const [closeH, closeM] = todayHours.close.split(":").map(Number);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openH * 60 + openM;
  // 00:00 kapanış → gece yarısı = 24*60 = 1440
  const closeMinutes = closeH === 0 && closeM === 0 ? 24 * 60 : closeH * 60 + closeM;

  if (nowMinutes >= openMinutes && nowMinutes < closeMinutes) {
    const closesAt = closeH === 0 && closeM === 0 ? "00:00" : todayHours.close;
    return {
      isOpen: true,
      label: "Şu an açık",
      closesAt,
    };
  }

  if (nowMinutes < openMinutes) {
    return {
      isOpen: false,
      label: "Şu an kapalı",
      opensAt: todayHours.open,
    };
  }

  return {
    isOpen: false,
    label: "Bugün kapandı",
    opensAt: `Yarın ${todayHours.open}`,
  };
}

/**
 * Çalışma saatlerini Türkçe gün adlarıyla döner.
 */
export function getFormattedHours() {
  return (Object.keys(STORE.hours) as DayKey[]).map((day) => ({
    day: DAY_TR[day],
    ...STORE.hours[day],
  }));
}
