"use client";

/**
 * Shop layout için client wrapper — oturum (üye girişi), sepet ve "Sepete eklendi" paneli burada.
 * Layout server component olarak kalır, bu wrapper client boundary'dir.
 */

import { SessionProvider } from "next-auth/react";
import { CartProvider } from "@/lib/cart/CartContext";
import CartAddedDrawer from "@/components/cart/CartAddedDrawer";
import type { ReactNode } from "react";

export default function ShopClientWrapper({ children }: { children: ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <CartProvider>
        {children}
        <CartAddedDrawer />
      </CartProvider>
    </SessionProvider>
  );
}
