/** İletişim formu konuları (saf; form ve sunucu ortak) */
export const CONTACT_SUBJECTS = [
  "Siparişim hakkında",
  "Ürün bilgisi",
  "İade / iptal",
  "Toptan / kurumsal sipariş",
  "Öneri / şikâyet",
  "Diğer",
] as const;

export type ContactSubject = (typeof CONTACT_SUBJECTS)[number];
