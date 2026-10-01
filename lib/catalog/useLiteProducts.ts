"use client";

/**
 * Öneri kartları için hafif ürün listesini /api/products/lite'tan okur (sayfa başına tek istek).
 * `enabled` false iken istek atılmaz (ör. sepet paneli ilk açılana kadar).
 */

import { useEffect, useState } from "react";
import type { LiteProduct } from "./recommendations";

type State =
  | { status: "idle" | "loading" }
  | { status: "ready"; products: LiteProduct[] }
  | { status: "error" };

let cache: Promise<LiteProduct[]> | null = null;

function load(): Promise<LiteProduct[]> {
  cache ??= fetch("/api/products/lite")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{ products: LiteProduct[] }>;
    })
    .then((d) => d.products)
    .catch((err) => {
      cache = null; // sonraki açılışta tekrar denensin
      throw err;
    });
  return cache;
}

export function useLiteProducts(enabled = true): State {
  const [state, setState] = useState<State>({ status: "idle" });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    load()
      .then((products) => alive && setState({ status: "ready", products }))
      .catch((err) => {
        console.error("[öneriler] Ürün listesi alınamadı:", err);
        if (alive) setState({ status: "error" });
      });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return state;
}
