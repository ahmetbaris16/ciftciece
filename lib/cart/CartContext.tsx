"use client";

/**
 * Çiftçi Ece — Sepet State (Client-side)
 *
 * localStorage tabanlı guest cart.
 * Sayfa refresh'te kaybolmaz.
 * React state ile çalışır — Zustand/Redux gerektirmez.
 *
 * Güvenlik notu: Sepet verisi sadece UI içindir.
 * Gerçek fiyat ve stok doğrulaması server'da yapılır.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import type { CartItem, Cart } from "@/types";

const CART_STORAGE_KEY = "ciftci_ece_cart_v1";

// ============================================================
// STATE
// ============================================================

type CartState = {
  items: CartItem[];
  isHydrated: boolean; // localStorage yüklendi mi?
};

type CartAction =
  | { type: "HYDRATE"; items: CartItem[] }
  | { type: "ADD_ITEM"; item: CartItem }
  | { type: "REMOVE_ITEM"; variantId: string }
  | { type: "UPDATE_QUANTITY"; variantId: string; quantity: number }
  | { type: "CLEAR" };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "HYDRATE":
      return { ...state, items: action.items, isHydrated: true };

    case "ADD_ITEM": {
      const existing = state.items.find(
        (i) => i.variantId === action.item.variantId
      );
      if (existing) {
        const newQty = existing.quantity + action.item.quantity;
        const maxQty = action.item.maxQuantity ?? 99;
        return {
          ...state,
          items: state.items.map((i) =>
            i.variantId === action.item.variantId
              ? { ...i, quantity: Math.min(newQty, maxQty) }
              : i
          ),
        };
      }
      return {
        ...state,
        items: [...state.items, action.item],
      };
    }

    case "REMOVE_ITEM":
      return {
        ...state,
        items: state.items.filter((i) => i.variantId !== action.variantId),
      };

    case "UPDATE_QUANTITY": {
      if (action.quantity <= 0) {
        return {
          ...state,
          items: state.items.filter((i) => i.variantId !== action.variantId),
        };
      }
      return {
        ...state,
        items: state.items.map((i) =>
          i.variantId === action.variantId
            ? { ...i, quantity: Math.min(action.quantity, i.maxQuantity ?? 99) }
            : i
        ),
      };
    }

    case "CLEAR":
      return { ...state, items: [] };

    default:
      return state;
  }
}

// ============================================================
// DERIVED DATA
// ============================================================

function deriveCart(items: CartItem[]): Cart {
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotalKurus = items.reduce(
    (sum, i) => sum + i.priceKurus * i.quantity,
    0
  );
  return { items, itemCount, subtotalKurus };
}

// ============================================================
// CONTEXT
// ============================================================

/** Sepete ekleme bildirimi: "Sepete eklendi" paneli bunu gösterir */
export type CartAddedNotice = {
  item: CartItem;
  /** Bu eklemede eklenen adet (sepetteki toplam değil) */
  addedQuantity: number;
  /** Aynı ürün tekrar eklendiğinde panelin yenilenmesi için */
  key: number;
};

type CartContextValue = {
  cart: Cart;
  isHydrated: boolean;
  /**
   * Sepete ekler. Varsayılan olarak "Sepete eklendi" paneli açılır;
   * panelin içinden hızlı eklemede { notify: false } verilir (panel yerinde kalır).
   */
  addItem: (item: CartItem, opts?: { notify?: boolean }) => void;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  clearCart: () => void;
  addedNotice: CartAddedNotice | null;
  dismissAddedNotice: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

// ============================================================
// PROVIDER
// ============================================================

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, {
    items: [],
    isHydrated: false,
  });

  // localStorage'dan hydrate et (sadece client'ta çalışır)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (raw) {
        const items = JSON.parse(raw) as CartItem[];
        dispatch({ type: "HYDRATE", items: Array.isArray(items) ? items : [] });
      } else {
        dispatch({ type: "HYDRATE", items: [] });
      }
    } catch {
      dispatch({ type: "HYDRATE", items: [] });
    }
  }, []);

  // State değişince localStorage'a yaz
  useEffect(() => {
    if (!state.isHydrated) return;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.items));
    } catch {
      // Quota exceeded veya private browsing — sessizce devam et
    }
  }, [state.items, state.isHydrated]);

  const [addedNotice, setAddedNotice] = useState<CartAddedNotice | null>(null);

  const addItem = useCallback((item: CartItem, opts?: { notify?: boolean }) => {
    dispatch({ type: "ADD_ITEM", item });
    if (opts?.notify !== false) {
      setAddedNotice((prev) => ({ item, addedQuantity: item.quantity, key: (prev?.key ?? 0) + 1 }));
    }
  }, []);

  const dismissAddedNotice = useCallback(() => setAddedNotice(null), []);

  const removeItem = useCallback((variantId: string) => {
    dispatch({ type: "REMOVE_ITEM", variantId });
  }, []);

  const updateQuantity = useCallback((variantId: string, quantity: number) => {
    dispatch({ type: "UPDATE_QUANTITY", variantId, quantity });
  }, []);

  const clearCart = useCallback(() => {
    dispatch({ type: "CLEAR" });
  }, []);

  const cart = deriveCart(state.items);

  return (
    <CartContext.Provider
      value={{
        cart,
        isHydrated: state.isHydrated,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        addedNotice,
        dismissAddedNotice,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

// ============================================================
// HOOK
// ============================================================

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within CartProvider");
  }
  return ctx;
}
