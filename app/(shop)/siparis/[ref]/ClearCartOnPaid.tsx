"use client";

/**
 * Ödeme onaylandığında sepeti temizler.
 * Sepet, ödeme sayfasına yönlendirmeden önce DEĞİL burada temizlenir: ödeme
 * başarısız olursa müşteri sepetini kaybetmeden tekrar deneyebilir.
 */

import { useEffect } from "react";
import { useCart } from "@/lib/cart/CartContext";

export default function ClearCartOnPaid() {
  const { clearCart, isHydrated } = useCart();
  useEffect(() => {
    if (isHydrated) clearCart();
  }, [isHydrated, clearCart]);
  return null;
}
