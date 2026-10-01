/**
 * Checkout doğrulaması — frontend ve backend AYNI kuralları kullanır.
 *
 * Müşteriye asla teknik mesaj (ZodError, "Validation failed" vb.) gösterilmez;
 * her kural kısa, anlaşılır Türkçe bir mesaj döndürür.
 */

import { z } from "zod";

// ── Mesajlar ────────────────────────────────────────────────

export const CHECKOUT_MESSAGES = {
  firstName: "Adınızı girin.",
  lastName: "Soyadınızı girin.",
  email: "Geçerli bir e-posta adresi girin.",
  phone: "Telefon numaranızı kontrol edin.",
  address: "Teslimat adresinizi girin.",
  district: "İlçe bilgisini girin.",
  city: "Şehir bilgisini girin.",
  postalCode: "Posta kodu 5 haneli olmalıdır.",
  shippingUnknown:
    "Siparişinizin kargo ücreti henüz hesaplanamıyor, bu yüzden sipariş şu anda çevrimiçi tamamlanamıyor. Siparişinizi telefon ya da WhatsApp ile verebilirsiniz: 0532 682 53 72",
  paymentMethod: "Bir ödeme yöntemi seçin.",
  paymentMethodUnavailable: "Seçtiğiniz ödeme yöntemi bu sipariş için kullanılamıyor. Lütfen başka bir yöntem seçin.",
  noPaymentMethod:
    "Şu anda çevrimiçi ödeme alamıyoruz. Siparişinizi telefon ya da WhatsApp ile verebilirsiniz: 0532 682 53 72",
  generic: "Sipariş bilgilerinizi kontrol edin.",
  orderFailed: "Sipariş oluşturulamadı. Lütfen tekrar deneyin.",
  paymentFailed: "Ödeme başlatılamadı. Lütfen tekrar deneyin.",
  productUnavailable: "Sepetinizdeki bir ürün artık satışta değil. Lütfen sepetinizi güncelleyin.",
  outOfStock: "Sepetinizdeki bir ürünün stoğu yetersiz. Lütfen adedi azaltın.",
  serviceUnavailable: "Şu anda sipariş alamıyoruz. Lütfen biraz sonra tekrar deneyin.",
} as const;

export type CheckoutField =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "address"
  | "district"
  | "city"
  | "postalCode"
  | "paymentMethod";

// ── Telefon (Türkiye cep) ───────────────────────────────────

/**
 * Serbest girilmiş numarayı Türkiye cep formatına normalize eder.
 * Kabul: "0532 682 53 72", "532 682 5372", "+90 532 682 53 72", "90532...".
 * Dönüş: "+905326825372" (E.164 — ödeme sağlayıcıları bu formatı ister) ya da null.
 */
export function normalizeTrPhone(input: string): string | null {
  if (/[^\d\s()+\-.]/.test(input)) return null; // harf vb. içeriyorsa geçersiz
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("90") && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  if (!/^5\d{9}$/.test(digits)) return null;
  return `+90${digits}`;
}

/** Yazarken "05XX XXX XX XX" biçiminde gösterir; harfleri atar, 11 haneyle sınırlar. */
export function formatTrPhoneInput(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("90")) d = d.slice(2);
  if (d.length > 0 && !d.startsWith("0")) d = "0" + d;
  d = d.slice(0, 11);
  const parts = [d.slice(0, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)].filter(Boolean);
  return parts.join(" ");
}

/** "+905326825372" → "0532 682 53 72" (admin ve sipariş ekranları için) */
export function displayTrPhone(e164: string): string {
  const n = normalizeTrPhone(e164);
  if (!n) return e164;
  return formatTrPhoneInput("0" + n.slice(3));
}

// ── Posta kodu ──────────────────────────────────────────────

/** Tam 5 rakam; ilk iki hane il plaka kodu (01–81). */
export function isValidTrPostalCode(value: string): boolean {
  if (!/^\d{5}$/.test(value)) return false;
  const plate = Number(value.slice(0, 2));
  return plate >= 1 && plate <= 81;
}

// ── Şemalar ─────────────────────────────────────────────────

const text = (min: number, max: number, message: string) =>
  z.string({ error: message }).trim().min(min, { error: message }).max(max, { error: message });

export const ContactSchema = z.object({
  firstName: text(1, 100, CHECKOUT_MESSAGES.firstName),
  lastName: text(1, 100, CHECKOUT_MESSAGES.lastName),
  email: z
    .string({ error: CHECKOUT_MESSAGES.email })
    .trim()
    .max(200, { error: CHECKOUT_MESSAGES.email })
    .pipe(z.email({ error: CHECKOUT_MESSAGES.email })),
  phone: z
    .string({ error: CHECKOUT_MESSAGES.phone })
    .transform((v, ctx) => {
      const n = normalizeTrPhone(v);
      if (!n) {
        ctx.addIssue({ code: "custom", message: CHECKOUT_MESSAGES.phone });
        return z.NEVER;
      }
      return n;
    }),
});

export const ShippingSchema = z.object({
  address: text(10, 500, CHECKOUT_MESSAGES.address),
  district: text(2, 100, CHECKOUT_MESSAGES.district),
  city: text(2, 100, CHECKOUT_MESSAGES.city),
  postalCode: z
    .string({ error: CHECKOUT_MESSAGES.postalCode })
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || isValidTrPostalCode(v), {
      error: CHECKOUT_MESSAGES.postalCode,
    }),
  // Kargo firması seçilmez (yalnız Yurtiçi Kargo); ücret sunucuda lib/shipping/quote ile hesaplanır
});

export const CheckoutItemSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
});

export const CheckoutSchema = z.object({
  items: z.array(CheckoutItemSchema).min(1).max(50),
  contact: ContactSchema,
  shipping: ShippingSchema,
  // Kullanılabilirlik (ayar, tutar sınırı) sunucuda lib/payment/methods ile ayrıca kontrol edilir
  paymentMethod: z.enum(["CARD", "BANK_TRANSFER", "CASH_ON_DELIVERY"], { error: CHECKOUT_MESSAGES.paymentMethod }),
});

export type CheckoutInput = z.infer<typeof CheckoutSchema>;

/**
 * Zod sonucunu alan → Türkçe mesaj haritasına çevirir.
 * Tanınmayan alanlar (ör. items) genel mesaja düşer.
 */
export function toFieldErrors(error: z.ZodError): {
  fieldErrors: Partial<Record<CheckoutField, string>>;
  message: string;
} {
  const fieldErrors: Partial<Record<CheckoutField, string>> = {};
  let message: string | null = null;
  for (const issue of error.issues) {
    const field = issue.path[issue.path.length - 1];
    if (typeof field === "string" && field in CHECKOUT_MESSAGES && issue.path[0] !== "items") {
      const f = field as CheckoutField;
      fieldErrors[f] ??= CHECKOUT_MESSAGES[f];
      message ??= CHECKOUT_MESSAGES[f];
    }
  }
  return { fieldErrors, message: message ?? CHECKOUT_MESSAGES.generic };
}

/** Frontend adım doğrulaması — sadece ilgili şemanın alanlarını döner. */
export function validateStep(
  schema: typeof ContactSchema | typeof ShippingSchema,
  values: unknown
): Partial<Record<CheckoutField, string>> {
  const r = schema.safeParse(values);
  return r.success ? {} : toFieldErrors(r.error).fieldErrors;
}
