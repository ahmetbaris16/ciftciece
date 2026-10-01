/**
 * Üyelik, profil ve ürün değerlendirmesi doğrulaması — frontend ve backend AYNI kuralları kullanır.
 * Müşteriye teknik mesaj gösterilmez; her kural kısa Türkçe bir mesaj döndürür.
 */

import { z } from "zod";
import { normalizeTrPhone } from "./checkout";

export const ACCOUNT_MESSAGES = {
  firstName: "Adınızı girin.",
  lastName: "Soyadınızı girin.",
  email: "Geçerli bir e-posta adresi girin.",
  phone: "Telefon numaranızı kontrol edin (05XX XXX XX XX).",
  password: "Şifre en az 8 karakter olmalı; en az bir harf ve bir rakam içermeli.",
  passwordLong: "Şifre çok uzun (en fazla 72 bayt).",
  acceptTerms: "Üye olmak için üyelik sözleşmesini ve kullanım koşullarını kabul edin.",
  currentPassword: "Mevcut şifrenizi girin.",
  wrongPassword: "Mevcut şifreniz hatalı.",
  emailTaken: "Bu e-posta adresiyle zaten bir üyelik var. Giriş yapmayı deneyin.",
  loginFailed: "E-posta adresi veya şifre hatalı.",
  tooMany: "Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.",
  unavailable: "Şu anda işlem yapılamıyor. Lütfen biraz sonra tekrar deneyin.",
  generic: "Bilgilerinizi kontrol edin.",
  resetRequested:
    "Bu e-posta adresiyle bir üyelik varsa şifre yenileme bağlantısını gönderdik. Gelen kutunuzu ve istenmeyen (spam) klasörünü kontrol edin; bağlantı 60 dakika geçerlidir.",
  resetLinkInvalid: "Bu şifre yenileme bağlantısı geçersiz ya da süresi dolmuş. Lütfen yeni bir bağlantı isteyin.",
  resetUnavailable:
    "E-postayla şifre yenileme şu anda kullanılamıyor. Hesabınızı doğrulayıp yardımcı olmamız için bize WhatsApp'tan ya da telefonla ulaşın.",
  reviewRating: "Lütfen 1–5 arasında puan verin.",
  reviewText: "Yorumunuz 10 ile 1500 karakter arasında olmalı.",
  reviewTitle: "Başlık en fazla 80 karakter olabilir.",
} as const;

export type AccountField =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "password"
  | "acceptTerms"
  | "currentPassword"
  | "newPassword"
  | "rating"
  | "title"
  | "text";

/** E-postayı karşılaştırılabilir biçime çevirir (Türkçe yerel ayarı KULLANMADAN: "I" → "i"). */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

const name = (message: string) =>
  z.string({ error: message }).trim().min(1, { error: message }).max(60, { error: message });

const email = z
  .string({ error: ACCOUNT_MESSAGES.email })
  .trim()
  .max(200, { error: ACCOUNT_MESSAGES.email })
  .transform(normalizeEmail)
  .pipe(z.email({ error: ACCOUNT_MESSAGES.email }));

/** Boş bırakılabilir; doluysa Türkiye cep numarası olmalı → "+905XXXXXXXXX" */
const optionalPhone = z
  .string({ error: ACCOUNT_MESSAGES.phone })
  .optional()
  .transform((v, ctx) => {
    if (!v || !v.trim()) return null;
    const n = normalizeTrPhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: ACCOUNT_MESSAGES.phone });
      return z.NEVER;
    }
    return n;
  });

/** bcrypt ilk 72 baytı kullanır; daha uzun şifre sessizce kesilmesin diye sınırlanır. */
const password = z
  .string({ error: ACCOUNT_MESSAGES.password })
  .min(8, { error: ACCOUNT_MESSAGES.password })
  .refine((v) => /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(v) && /\d/.test(v), { error: ACCOUNT_MESSAGES.password })
  .refine((v) => new TextEncoder().encode(v).length <= 72, { error: ACCOUNT_MESSAGES.passwordLong });

export const RegisterSchema = z.object({
  firstName: name(ACCOUNT_MESSAGES.firstName),
  lastName: name(ACCOUNT_MESSAGES.lastName),
  email,
  phone: optionalPhone,
  password,
  acceptTerms: z.literal(true, { error: ACCOUNT_MESSAGES.acceptTerms }),
});

export const ProfileSchema = z.object({
  firstName: name(ACCOUNT_MESSAGES.firstName),
  lastName: name(ACCOUNT_MESSAGES.lastName),
  phone: optionalPhone,
});

export const PasswordChangeSchema = z.object({
  currentPassword: z
    .string({ error: ACCOUNT_MESSAGES.currentPassword })
    .min(1, { error: ACCOUNT_MESSAGES.currentPassword }),
  newPassword: password,
});

export const PasswordResetRequestSchema = z.object({ email });

export const PasswordResetSchema = z.object({
  token: z.string({ error: ACCOUNT_MESSAGES.resetLinkInvalid }).min(20, { error: ACCOUNT_MESSAGES.resetLinkInvalid }).max(200),
  newPassword: password,
});

export const ReviewSchema = z.object({
  productId: z.string().min(1).max(120),
  rating: z
    .number({ error: ACCOUNT_MESSAGES.reviewRating })
    .int({ error: ACCOUNT_MESSAGES.reviewRating })
    .min(1, { error: ACCOUNT_MESSAGES.reviewRating })
    .max(5, { error: ACCOUNT_MESSAGES.reviewRating }),
  title: z
    .string({ error: ACCOUNT_MESSAGES.reviewTitle })
    .trim()
    .max(80, { error: ACCOUNT_MESSAGES.reviewTitle })
    .optional()
    .transform((v) => (v ? v : null)),
  text: z
    .string({ error: ACCOUNT_MESSAGES.reviewText })
    .trim()
    .min(10, { error: ACCOUNT_MESSAGES.reviewText })
    .max(1500, { error: ACCOUNT_MESSAGES.reviewText }),
});

/** Zod hatalarını alan → Türkçe mesaj haritasına çevirir (ilk mesaj genel mesaj olur). */
export function accountFieldErrors(error: z.ZodError): {
  fieldErrors: Partial<Record<AccountField, string>>;
  message: string;
} {
  const fieldErrors: Partial<Record<AccountField, string>> = {};
  let message: string | null = null;
  for (const issue of error.issues) {
    const field = issue.path[issue.path.length - 1];
    if (typeof field === "string") {
      fieldErrors[field as AccountField] ??= issue.message;
    }
    message ??= issue.message;
  }
  return { fieldErrors, message: message ?? ACCOUNT_MESSAGES.generic };
}

/** "Ahmet Barış Yılmaz" → { firstName: "Ahmet Barış", lastName: "Yılmaz" } */
export function splitFullName(full: string | null | undefined): { firstName: string; lastName: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/** Yorumlarda gösterilen ad: "Ahmet Barış Yılmaz" → "Ahmet Barış Y." (soyadı açık yazılmaz) */
export function publicDisplayName(full: string | null | undefined): string {
  const { firstName, lastName } = splitFullName(full);
  if (!firstName) return "Müşterimiz";
  return lastName ? `${firstName} ${lastName.charAt(0).toLocaleUpperCase("tr-TR")}.` : firstName;
}

/**
 * Giriş/üyelik sonrası dönülecek adres: yalnız site içi göreli yol kabul edilir
 * (açık yönlendirme olmasın: "//evil.com", "https://..." reddedilir).
 */
export function safeNextPath(value: string | null | undefined, fallback = "/hesabim"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
