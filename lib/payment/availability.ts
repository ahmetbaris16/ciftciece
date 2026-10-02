/**
 * Kartla ödemenin bu istekteki ziyaretçi için durumu (sunucu). Demo (banka sayfasının demo kopyası) ve bankanın
 * test ortamında gerçek para çekilmez: canlı sunucuda yalnız yönetici kartla öder, gerçek müşteri parası alınmamış
 * "ödenmiş" sipariş veremez (kartı "yakında" görür). Geliştirmede herkese açıktır.
 */

import { getCurrentUser } from "@/lib/auth/session";
import type { CardAvailability } from "./methods";
import { cardPaymentMode } from "./provider";

export async function cardAvailabilityForRequest(): Promise<CardAvailability> {
  const mode = cardPaymentMode();
  if (mode === "live") return "ready";
  if (mode === "off") return "unavailable";
  if (process.env.NODE_ENV === "production") {
    const user = await getCurrentUser().catch(() => null);
    if (user?.role !== "ADMIN") return "unavailable";
  }
  return mode === "demo" ? "demo" : "test";
}
