/**
 * Siparişte değişiklik yapma izni (teslimat bilgisi). Sipariş sayfası sipariş numarasıyla açılır; numara
 * e-postada, havale açıklamasında, WhatsApp mesajında geçer — tek başına adresi değiştirmeye (paketi başka yere
 * yönlendirmeye) yetmez. İzin üç yoldan gelir:
 *
 *  1. Siparişi veren tarayıcı: sipariş açılınca httpOnly çerez (ce_order_access) bırakılır (30 gün, en çok 10
 *     sipariş). Çerezdeki anahtar sunucu sırrıyla sipariş numarasından türetilir (HMAC); tahmin edilemez,
 *     veritabanında tutulmaz.
 *  2. Üye siparişinde siparişin sahibi olan hesapla giriş.
 *  3. Başka cihazdan: sipariş e-postasına gönderilen 24 saatlik bağlantı (imzalı, son geçerlilik zamanlı); açılınca
 *     o tarayıcıya da çerez bırakılır.
 *
 * Sunucu sırrı (NEXTAUTH_SECRET) değişirse eski çerezler ve bağlantılar geçersiz olur (müşteri e-postayla yeniden
 * bağlantı ister).
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SECRET = process.env.NEXTAUTH_SECRET || randomBytes(32).toString("hex");

export const ORDER_ACCESS_COOKIE = "ce_order_access";
export const ORDER_ACCESS_DAYS = 30;
/** Bir tarayıcıda en çok bu kadar siparişin izni tutulur (en yeniler) */
const MAX_ENTRIES = 10;
/** E-postadaki değiştirme bağlantısının geçerlilik süresi */
export const ORDER_LINK_HOURS = 24;

const mac = (purpose: string, value: string) => createHmac("sha256", SECRET).update(`${purpose}:${value}`).digest();

/** Bu siparişin çerez anahtarı (22 karakter, 132 bit) */
export function orderAccessKey(reference: string): string {
  return mac("order-access:v1", reference).subarray(0, 16).toString("base64url").slice(0, 22);
}

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Çerezdeki anahtarlar (en yeni önce) */
export function parseOrderAccessCookie(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(".")
    .filter((k) => /^[A-Za-z0-9_-]{22}$/.test(k))
    .slice(0, MAX_ENTRIES);
}

/** Bu tarayıcının çerezi bu sipariş için izin veriyor mu */
export function hasOrderAccess(cookieValue: string | null | undefined, reference: string): boolean {
  const key = orderAccessKey(reference);
  return parseOrderAccessCookie(cookieValue).some((k) => sameText(k, key));
}

/** Siparişin anahtarını başa ekler (eskiler korunur, en çok 10) */
export function addOrderAccess(cookieValue: string | null | undefined, reference: string): string {
  const key = orderAccessKey(reference);
  return [key, ...parseOrderAccessCookie(cookieValue).filter((k) => k !== key)].slice(0, MAX_ENTRIES).join(".");
}

export function orderAccessCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // Yayındaki site https: çerez yalnız şifreli bağlantıda gider (yerel denemede http)
    secure: (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://"),
    path: "/",
    maxAge: ORDER_ACCESS_DAYS * 24 * 60 * 60,
  };
}

// ── E-posta bağlantısı (başka cihaz) ─────────────────────────

/** "<son geçerlilik (sn, 36'lık)>.<imza>" */
export function orderLinkToken(reference: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000 + ORDER_LINK_HOURS * 3600).toString(36);
  return `${exp}.${mac("order-link:v1", `${reference}:${exp}`).subarray(0, 18).toString("base64url")}`;
}

export function verifyOrderLinkToken(reference: string, token: string | null | undefined, now = Date.now()): boolean {
  const m = /^([0-9a-z]{1,10})\.([A-Za-z0-9_-]{24})$/.exec(token ?? "");
  if (!m) return false;
  const exp = parseInt(m[1], 36);
  if (!Number.isFinite(exp) || exp * 1000 <= now) return false;
  return sameText(m[2], mac("order-link:v1", `${reference}:${m[1]}`).subarray(0, 18).toString("base64url"));
}
