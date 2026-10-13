/**
 * Siparişte onaylatılan yasal metinler ve sürümleri (saf; sunucu ve istemci ortak).
 *
 * Siparişte müşterinin onayı order_consents tablosuna belge + sürüm + zaman + IP olarak yazılır.
 * KURAL: Metin değiştiğinde sürüm de değiştirilir (önceki sürümün metni arşivlenmeli: git geçmişi).
 * Sürüm, metnin son değiştiği tarihtir (sayfa dosyaları: app/(legal)/...).
 */

export const LEGAL_DOCUMENTS = {
  // 2026-10-07: ödeme bölümünde kapıda ödeme yok (seçenek kaldırıldı)
  // 2026-10-14: metin sipariş onay e-postasına eklenmez; e-postadaki bağlantıdan ve sipariş sayfasından erişilir
  PRE_INFORMATION_FORM: {
    title: "Ön Bilgilendirme Formu",
    path: "/on-bilgilendirme",
    version: "2026-10-14",
  },
  // 2026-10-07: Madde 5 — kapıda ödeme yok
  // 2026-10-14: Madde 11 — kopya e-postayla gönderilmez; e-postadaki bağlantıdan ve sipariş sayfasından erişilir
  DISTANCE_SALES_CONTRACT: {
    title: "Mesafeli Satış Sözleşmesi",
    path: "/mesafeli-satis-sozlesmesi",
    version: "2026-10-14",
  },
  // Üye olurken onaylanır (siparişte değil). 2026-10-07: değerlendirme cümleleri (06.10 anında yayın, 07.10
  // değerlendirme kodu). 2026-10-14: değerlendirme kodu kaldırıldı (misafir siparişi sipariş sayfasından kodsuz)
  MEMBERSHIP_AGREEMENT: {
    title: "Üyelik Sözleşmesi",
    path: "/uyelik-sozlesmesi",
    version: "2026-10-14",
  },
} as const;

export type LegalDocumentId = keyof typeof LEGAL_DOCUMENTS;

/** Ödeme sayfasındaki tek onay kutusu iki belgeyi birlikte onaylatır; istemci bu sürümü gönderir. */
export const CHECKOUT_TERMS_VERSION = `${LEGAL_DOCUMENTS.PRE_INFORMATION_FORM.version}+${LEGAL_DOCUMENTS.DISTANCE_SALES_CONTRACT.version}`;

export const CHECKOUT_CONSENT_DOCUMENTS: LegalDocumentId[] = ["PRE_INFORMATION_FORM", "DISTANCE_SALES_CONTRACT"];
