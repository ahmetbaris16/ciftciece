/**
 * İşletme (satıcı) bilgileri — admin → Ayarlar → İşletme bilgileri'nden düzenlenir (site_settings, key "business").
 *
 * Mevzuat bu bilgilerin sitede "iletişim" başlığı altında, ön bilgilendirme formunda ve mesafeli satış
 * sözleşmesinde yer almasını ister (unvan ya da ad-soyad, MERSİS ya da vergi kimlik no, adres, telefon,
 * e-posta; varsa KEP ve meslek odası). Altbilgi, iletişim sayfası, yasal metinler ve e-postalar buradan okur.
 *
 * KURAL: Girilmemiş kimlik bilgisi uydurulmaz. Boş alan sayfada gösterilmez; admin panelinde "eksik" uyarısı
 * çıkar (missingBusinessFields). Adres, telefon, WhatsApp ve Instagram'ın başlangıç değerleri
 * lib/config/store.ts'tendir (kullanıcının verdiği bilgiler).
 *
 * Saf modül: sunucu ve istemci ortak kullanır (veritabanı erişimi business.repository.ts'te).
 */

import { STORE } from "@/lib/config/store";

export const BUSINESS_SETTING_KEY = "business";

/** PERSON: şahıs işletmesi (esnaf/tacir), COMPANY: şirket. Boş = seçilmemiş. */
export type BusinessType = "PERSON" | "COMPANY" | "";

export interface BusinessInfo {
  type: BusinessType;
  /** Şirkette ticaret unvanı, şahıs işletmesinde ad-soyad (vergi levhasındaki gibi) */
  legalName: string;
  /** Sitede görünen ad */
  tradeName: string;
  taxOffice: string;
  /** VKN (10 hane) ya da şahıs işletmesinde TCKN (11 hane) */
  taxNumber: string;
  /** MERSİS numarası (16 hane) — şirketlerde ve ticaret siciline kayıtlı tacirlerde */
  mersisNo: string;
  tradeRegistryNo: string;
  /** Kayıtlı elektronik posta adresi (varsa) */
  kepAddress: string;
  /** Kayıtlı olunan meslek odası (ör. esnaf ve sanatkârlar odası, ticaret odası) */
  chamber: string;
  /** Açık adres (tebligat/merkez adresi) */
  address: string;
  /** Telefon (yalnız rakam, ör. 05326825372) */
  phone: string;
  /** WhatsApp numarası (ülke koduyla, yalnız rakam: 905326825372) */
  whatsapp: string;
  /** Müşterilerin yazacağı e-posta (sitede görünür, e-postalarda "yanıtla" adresi) */
  email: string;
  /** Sipariş ve mesaj bildirimlerinin gideceği adres; boşsa `email` kullanılır */
  notificationEmail: string;
  instagramUrl: string;
}

export const DEFAULT_BUSINESS_INFO: BusinessInfo = {
  type: "",
  legalName: "",
  tradeName: STORE.name,
  taxOffice: "",
  taxNumber: "",
  mersisNo: "",
  tradeRegistryNo: "",
  kepAddress: "",
  chamber: "",
  address: STORE.address.full,
  phone: STORE.contact.phone,
  whatsapp: STORE.contact.whatsapp,
  email: "",
  notificationEmail: "",
  instagramUrl: STORE.contact.instagramUrl,
};

export const BUSINESS_LIMITS = {
  legalName: 200,
  tradeName: 100,
  taxOffice: 80,
  tradeRegistryNo: 40,
  kepAddress: 120,
  chamber: 160,
  address: 300,
  email: 254,
  instagramUrl: 300,
} as const;

const onlyDigits = (v: string) => v.replace(/\D/g, "");

/** Basit e-posta biçimi (gönderim denetimi değil) */
export function isEmailLike(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254;
}

/** T.C. kimlik numarası kontrol haneleri */
export function isValidTckn(v: string): boolean {
  if (!/^[1-9]\d{10}$/.test(v)) return false;
  const d = v.split("").map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  const d11 = (d.slice(0, 10).reduce((a, b) => a + b, 0)) % 10;
  return d[9] === d10 && d[10] === d11;
}

/** Vergi kimlik numarası (10 hane) kontrol hanesi — GİB algoritması */
export function isValidVkn(v: string): boolean {
  if (!/^\d{10}$/.test(v)) return false;
  const d = v.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const tmp = (d[i] + 9 - i) % 10;
    let val = (tmp * 2 ** (9 - i)) % 9;
    if (tmp !== 0 && val === 0) val = 9;
    sum += val;
  }
  return (10 - (sum % 10)) % 10 === d[9];
}

/** Telefonu "0532 682 53 72" biçiminde gösterir (Türkiye numarası değilse olduğu gibi) */
export function formatPhoneTr(phone: string): string {
  let d = onlyDigits(phone);
  if (d.startsWith("90") && d.length === 12) d = `0${d.slice(2)}`;
  if (d.length === 10 && !d.startsWith("0")) d = `0${d}`;
  if (d.length !== 11) return phone;
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** DB'deki JSON → geçerli değer (bozuk/eksik alanlar varsayılana döner) */
export function parseBusinessInfo(raw: string | null | undefined): BusinessInfo {
  let obj: Record<string, unknown> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") obj = parsed as Record<string, unknown>;
    } catch {
      obj = {};
    }
  }
  const pick = (key: keyof BusinessInfo, max: number) =>
    typeof obj[key] === "string" ? str(obj[key], max) : DEFAULT_BUSINESS_INFO[key];
  // Numara alanları: önce rakam dışı karakterler (boşluk, tire) atılır, sonra uzunluk sınırlanır
  const digits = (key: keyof BusinessInfo, max: number) =>
    typeof obj[key] === "string" ? onlyDigits(obj[key] as string).slice(0, max) : onlyDigits(DEFAULT_BUSINESS_INFO[key]);
  const type = obj.type === "PERSON" || obj.type === "COMPANY" ? obj.type : "";
  return {
    type,
    legalName: pick("legalName", BUSINESS_LIMITS.legalName),
    tradeName: pick("tradeName", BUSINESS_LIMITS.tradeName) || DEFAULT_BUSINESS_INFO.tradeName,
    taxOffice: pick("taxOffice", BUSINESS_LIMITS.taxOffice),
    taxNumber: digits("taxNumber", 11),
    mersisNo: digits("mersisNo", 16),
    tradeRegistryNo: pick("tradeRegistryNo", BUSINESS_LIMITS.tradeRegistryNo),
    kepAddress: pick("kepAddress", BUSINESS_LIMITS.kepAddress),
    chamber: pick("chamber", BUSINESS_LIMITS.chamber),
    address: pick("address", BUSINESS_LIMITS.address) || DEFAULT_BUSINESS_INFO.address,
    phone: digits("phone", 15) || DEFAULT_BUSINESS_INFO.phone,
    whatsapp: digits("whatsapp", 15),
    email: pick("email", BUSINESS_LIMITS.email).toLowerCase(),
    notificationEmail: pick("notificationEmail", BUSINESS_LIMITS.email).toLowerCase(),
    instagramUrl: pick("instagramUrl", BUSINESS_LIMITS.instagramUrl),
  };
}

/**
 * Kaydetmeden önce biçim denetimi. Dönen dizi boşsa geçerli.
 * Kontrol hanesi (VKN/TCKN) burada zorlanmaz: admin formu uyarır ve onay ister (yanlış algoritma doğru
 * numarayı engellemesin); hane sayısı zorunludur.
 */
export function validateBusinessInfo(info: BusinessInfo): string[] {
  const errors: string[] = [];
  if (info.taxNumber && !/^\d{10,11}$/.test(info.taxNumber)) {
    errors.push("Vergi numarası 10 haneli VKN ya da 11 haneli T.C. kimlik numarası olmalı.");
  }
  if (info.mersisNo && !/^\d{16}$/.test(info.mersisNo)) errors.push("MERSİS numarası 16 haneli olmalı.");
  if (info.email && !isEmailLike(info.email)) errors.push("E-posta adresi geçersiz.");
  if (info.notificationEmail && !isEmailLike(info.notificationEmail)) errors.push("Bildirim e-postası geçersiz.");
  if (info.kepAddress && !isEmailLike(info.kepAddress)) errors.push("KEP adresi geçersiz (ör. unvan@hs01.kep.tr).");
  if (info.phone && !/^\d{10,12}$/.test(info.phone)) errors.push("Telefon numarası geçersiz.");
  if (info.whatsapp && !/^[1-9]\d{10,13}$/.test(info.whatsapp)) {
    errors.push("WhatsApp numarası ülke koduyla yazılmalı (ör. 905326825372).");
  }
  if (info.instagramUrl && !/^https:\/\/(www\.)?instagram\.com\//.test(info.instagramUrl)) {
    errors.push("Instagram adresi https://www.instagram.com/... biçiminde olmalı.");
  }
  if (info.address.length < 10) errors.push("Açık adres çok kısa.");
  return errors;
}

/** Kontrol hanesi uyarısı (engellemez) */
export function taxNumberWarning(taxNumber: string): string | null {
  if (!taxNumber) return null;
  if (taxNumber.length === 10 && !isValidVkn(taxNumber)) return "Vergi kimlik numarasının kontrol hanesi tutmuyor.";
  if (taxNumber.length === 11 && !isValidTckn(taxNumber)) return "T.C. kimlik numarasının kontrol hanesi tutmuyor.";
  return null;
}

/** Yayından önce doldurulması gereken alanlar (admin kontrol listesi) */
export function missingBusinessFields(info: BusinessInfo): string[] {
  const missing: string[] = [];
  if (!info.type) missing.push("İşletme türü");
  if (!info.legalName) missing.push(info.type === "PERSON" ? "Ad-soyad (vergi levhasındaki)" : "Ticaret unvanı");
  if (!info.taxOffice) missing.push("Vergi dairesi");
  if (!info.taxNumber) missing.push("Vergi numarası");
  if (info.type === "COMPANY" && !info.mersisNo) missing.push("MERSİS numarası");
  if (!info.email) missing.push("E-posta");
  return missing;
}

/** Sözleşme ve iletişim sayfasında satıcıyı anlatan satırlar (boş alanlar atlanır) */
export function sellerLines(info: BusinessInfo): Array<{ label: string; value: string }> {
  const lines: Array<{ label: string; value: string }> = [];
  const add = (label: string, value: string) => {
    if (value) lines.push({ label, value });
  };
  add(info.type === "PERSON" ? "Satıcı (ad-soyad)" : "Ticaret unvanı", info.legalName);
  if (info.tradeName && info.tradeName !== info.legalName) add("İşletme adı", info.tradeName);
  add("Adres", info.address);
  add("Telefon", info.phone ? formatPhoneTr(info.phone) : "");
  add("E-posta", info.email);
  add("KEP adresi", info.kepAddress);
  add("Vergi dairesi", info.taxOffice);
  add(info.taxNumber.length === 11 ? "T.C. kimlik no" : "Vergi kimlik no", info.taxNumber);
  add("MERSİS no", info.mersisNo);
  add("Ticaret sicil no", info.tradeRegistryNo);
  add("Meslek odası", info.chamber);
  return lines;
}

/** Bildirimlerin gideceği adres (yoksa null) */
export function notificationAddress(info: BusinessInfo): string | null {
  return info.notificationEmail || info.email || null;
}

/** Sözleşmelerde satıcının adı: unvan girilmemişse işletme adı */
export function sellerDisplayName(info: BusinessInfo): string {
  return info.legalName || info.tradeName;
}
