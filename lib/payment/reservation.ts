/**
 * Stok tutma (rezervasyon) süreleri — kullanıcı kararı, Oturum 2 (2026-10-01).
 *
 * KART: 30 dakika. Tek ayar: CARD_RESERVATION_MINUTES.
 *   iyzico ödeme formu token'ının ömrü dokümana göre 30 dk'dır: initialize yanıtındaki
 *   `tokenExpireTime` alanı saniye cinsindendir, değeri 1800 (docs.iyzico.com "Pay with iyzico" —
 *   "the generated link and token values are valid for 30 minutes"; Ortak Ödeme Formu yanıtında da
 *   aynı alan vardır, iyzipay-java CheckoutFormInitializeResource.tokenExpireTime).
 *   Rezervasyon token ömrünü geçmez: süresi dolmuş formla ödeme yapılamaz, daha uzun stok tutmanın
 *   faydası yok. iyzico daha kısa bir süre bildirirse rezervasyon o token'ın bitişine çekilir
 *   (lib/payment/card.ts), ama hiçbir durumda siparişten itibaren 30 dk'yı aşmaz.
 *
 * HAVALE/EFT: 48 takvim saati (iş günü/tatil ayrımı yok). Değer admin → Ayarlar → Ödeme'dedir
 *   (lib/payment/methods.ts, varsayılan 48).
 */

/** iyzico Ortak Ödeme Formu token ömrü (dokümandaki değer; dakika) */
export const IYZICO_CHECKOUT_TOKEN_TTL_MINUTES = 30;

/** Kart siparişinin stok tutma süresi (dakika) */
export const CARD_RESERVATION_MINUTES = Math.min(30, IYZICO_CHECKOUT_TOKEN_TTL_MINUTES);

export function cardPaymentDueAt(from: Date | number = Date.now()): Date {
  const start = typeof from === "number" ? from : from.getTime();
  return new Date(start + CARD_RESERVATION_MINUTES * 60_000);
}
