/**
 * Checkout idempotency anahtarı — tarayıcı tarafı (sessionStorage).
 *
 * Aynı sipariş niyeti (sepet + iletişim + adres + ödeme yöntemi) için aynı anahtar kullanılır:
 * yanıt kaybolsa, sayfa yenilense ya da iyzico'dan dönülse bile tekrar gönderim yeni sipariş açmaz
 * (sunucu: orders.idempotencyKey UNIQUE). Bilgiler değişince yeni anahtar üretilir. Sipariş
 * tamamlanınca ya da kapanınca anahtar silinir (aynı sepetle yeni sipariş verilebilsin).
 */

const STORAGE_KEY = "ciftci_ece_checkout_key_v2";

function newUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Eski tarayıcı: RFC 4122 v4, crypto.getRandomValues ile
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * İçeriğin kısa özeti (cyrb53, 53 bit). Kişisel veri (ad, telefon, adres) tarayıcıya düz metin
 * yazılmasın diye yalnız özet saklanır. Güvenlik amacı yok: yalnız "bilgiler değişti mi" sorusuna cevap.
 */
function digest(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function checkoutKeyFor(fingerprint: string): string {
  const fp = digest(fingerprint);
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const saved = raw ? (JSON.parse(raw) as { fp?: unknown; key?: unknown }) : null;
    if (saved && saved.fp === fp && typeof saved.key === "string") return saved.key;
  } catch {
    // sessionStorage kapalı/erişilemiyor: anahtar yalnız bu gönderim için üretilir
  }
  const key = newUuid();
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ fp, key }));
  } catch {
    // yok sayılır (gizli mod vb.)
  }
  return key;
}

export function forgetCheckoutKey() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // yok sayılır
  }
}
