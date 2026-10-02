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
 *
 * Eşitleme: sayfa açılınca (ve ödeme sayfası istediğinde) kalemler /api/cart ile sunucudaki güncel
 * bilgiyle karşılaştırılır (lib/cart/sync). Silinmiş/kimliği değişmiş ürün sepette kalıp ödemede
 * "satışta değil" hatasına yol açmasın; değişiklikler müşteriye `cartChanges` ile söylenir.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CartItem, Cart } from "@/types";
import { CART_SYNC_MAX_ITEMS, applyCartSync, type CartLine } from "./sync";

const CART_STORAGE_KEY = "ciftci_ece_cart_v1";

// ============================================================
// STATE
// ============================================================

type CartState = {
  items: CartItem[];
  isHydrated: boolean; // localStorage yüklendi mi?
  /** Son eşitlemede sepette değişenler (müşteriye gösterilir, "Tamam" ile kapanır) */
  changes: string[];
};

type CartAction =
  | { type: "HYDRATE"; items: CartItem[] }
  | { type: "ADD_ITEM"; item: CartItem }
  | { type: "REMOVE_ITEM"; variantId: string }
  | { type: "UPDATE_QUANTITY"; variantId: string; quantity: number }
  | { type: "CLEAR" }
  | { type: "SYNC"; lines: CartLine[] }
  | { type: "DISMISS_CHANGES" };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "HYDRATE":
      return { ...state, items: action.items, isHydrated: true };

    case "SYNC": {
      const { items, changes } = applyCartSync(state.items, action.lines);
      return {
        ...state,
        items,
        changes: changes.length > 0 ? Array.from(new Set([...state.changes, ...changes])) : state.changes,
      };
    }

    case "DISMISS_CHANGES":
      return { ...state, changes: [] };

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
  /** Sepeti sunucudaki güncel bilgiyle eşitler (sürmekte olan eşitleme varsa onu bekler) */
  syncCart: () => Promise<void>;
  cartChanges: string[];
  dismissCartChanges: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

// ============================================================
// PROVIDER
// ============================================================

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, {
    items: [],
    isHydrated: false,
    changes: [],
  });

  // Alt bileşenlerin effect'leri (ör. ödeme sayfası) güncel kalemleri okusun: layout effect onlardan önce çalışır
  const itemsRef = useRef<CartItem[]>([]);
  useLayoutEffect(() => {
    itemsRef.current = state.items;
  }, [state.items]);

  const inflightSync = useRef<Promise<void> | null>(null);
  const startSync = useCallback((items: CartItem[]): Promise<void> => {
    if (inflightSync.current) return inflightSync.current;
    const variantIds = Array.from(new Set(items.map((i) => i.variantId))).slice(0, CART_SYNC_MAX_ITEMS);
    if (variantIds.length === 0) return Promise.resolve();
    const run = fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantIds }),
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { lines?: CartLine[] };
        if (Array.isArray(data.lines)) dispatch({ type: "SYNC", lines: data.lines });
      })
      // Eşitlenemezse sepet olduğu gibi kalır; sipariş anında sunucu yine doğrular
      .catch((err) => console.warn("[cart] Sepet sunucuyla eşitlenemedi:", err))
      .finally(() => {
        inflightSync.current = null;
      });
    inflightSync.current = run;
    return run;
  }, []);

  const syncCart = useCallback(() => startSync(itemsRef.current), [startSync]);
  const dismissCartChanges = useCallback(() => dispatch({ type: "DISMISS_CHANGES" }), []);

  // localStorage'dan hydrate et (sadece client'ta çalışır), ardından sunucuyla eşitle
  useEffect(() => {
    let items: CartItem[] = [];
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) items = parsed as CartItem[];
    } catch {
      // Bozuk kayıt: boş sepetle devam
    }
    dispatch({ type: "HYDRATE", items });
    void startSync(items);
  }, [startSync]);

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
        syncCart,
        cartChanges: state.changes,
        dismissCartChanges,
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
