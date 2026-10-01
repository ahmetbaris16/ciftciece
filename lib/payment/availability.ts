/**
 * Kartla ödemenin bu istekteki ziyaretçi için durumu (sunucu). Test ortamında yalnız yönetici kartla öder:
 * gerçek müşteri bankanın test ortamında "ödenmiş" (parası alınmamış) sipariş veremez.
 */

import { getCurrentUser } from "@/lib/auth/session";
import type { CardAvailability } from "./methods";
import { cardPaymentMode } from "./provider";

export async function cardAvailabilityForRequest(): Promise<CardAvailability> {
  const mode = cardPaymentMode();
  if (mode === "live") return "ready";
  if (mode === "demo") return "unavailable";
  if (process.env.NODE_ENV !== "production") return "test";
  const user = await getCurrentUser().catch(() => null);
  return user?.role === "ADMIN" ? "test" : "unavailable";
}
