/**
 * Checkout idempotency — isteğin özeti.
 *
 * İstemci her sipariş niyeti için bir UUID üretir (ödeme sayfası, sessionStorage). Sunucu bu anahtarı
 * orders.idempotencyKey'e yazar (UNIQUE). Aynı anahtar tekrar gelirse yeni sipariş açılmaz; ancak
 * içerik de aynı olmalıdır: özet farklıysa anahtar başka bir istek için kullanılmış demektir (409).
 * Özet, doğrulanmış (normalize edilmiş) istekten hesaplanır: kalemler variantId'ye göre birleştirilip
 * sıralanır; fiyat yoktur (fiyat her zaman sunucuda DB'den hesaplanır).
 */

import { createHash } from "node:crypto";
import type { CheckoutInput } from "@/lib/validation/checkout";

export function checkoutRequestHash(input: CheckoutInput): string {
  const quantities = new Map<string, number>();
  for (const item of input.items) quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
  const items = [...quantities.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonical = JSON.stringify({
    items,
    contact: [input.contact.firstName, input.contact.lastName, input.contact.email.toLowerCase(), input.contact.phone],
    shipping: [input.shipping.address, input.shipping.district, input.shipping.city, input.shipping.postalCode ?? ""],
    paymentMethod: input.paymentMethod,
    termsVersion: input.termsVersion,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
