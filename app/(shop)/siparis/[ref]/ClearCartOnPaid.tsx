"use client";

/**
 * Ödeme onaylandığında sepeti temizler.
 * Sepet, ödeme sayfasına yönlendirmeden önce DEĞİL burada temizlenir: ödeme
 * başarısız olursa müşteri sepetini kaybetmeden tekrar deneyebilir.
 */

import { useEffect } from "react";
import { useCart } from "@/lib/cart/CartContext";
import { forgetCheckoutKey } from "@/lib/checkout/client-key";

export default function ClearCartOnPaid() {
  const { clearCart, isHydrated } = useCart();
  useEffect(() => {
    if (!isHydrated) return;
    clearCart();
    // Sipariş kesinleşti: aynı sepetle verilecek yeni sipariş yeni idempotency anahtarı alsın
    forgetCheckoutKey();
  }, [isHydrated, clearCart]);
  return null;
}
