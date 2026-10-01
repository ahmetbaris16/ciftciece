"use client";

/**
 * Kargo özetini (Yurtiçi Kargo + ücretsiz kargo eşiği) /api/shipping'den okur (sayfa başına tek istek).
 * Gösterim içindir — sepete göre ücret useShippingQuote'tan gelir, sipariş tutarı sunucuda hesaplanır.
 */

import { useEffect, useState } from "react";
import type { PublicShippingInfo } from "./settings";

type State =
  | { status: "loading" }
  | { status: "ready"; settings: PublicShippingInfo }
  | { status: "error" };

let cache: Promise<PublicShippingInfo> | null = null;

function load(): Promise<PublicShippingInfo> {
  cache ??= fetch("/api/shipping", { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<PublicShippingInfo>;
    })
    .catch((err) => {
      cache = null; // sonraki denemede tekrar istensin
      throw err;
    });
  return cache;
}

export function useShippingSettings(): State {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    load()
      .then((settings) => alive && setState({ status: "ready", settings }))
      .catch((err) => {
        console.error("[shipping] Kargo seçenekleri alınamadı:", err);
        if (alive) setState({ status: "error" });
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
