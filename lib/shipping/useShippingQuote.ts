"use client";

/**
 * Sepetin Yurtiçi Kargo ücretini /api/shipping/quote'tan alır; sepet değişince (adet artır/azalt)
 * kısa bir beklemeyle yeniden sorar, eski istek iptal edilir. İstemci tutar hesaplamaz; istek başarısızsa
 * ekranda rakam gösterilmez.
 */

import { useEffect, useState } from "react";

export type ClientShippingQuote =
  | { status: "free"; carrierName: string; feeKurus: 0 }
  | { status: "priced"; carrierName: string; feeKurus: number }
  | { status: "recipient"; carrierName: string; feeKurus: 0 };

export type ShippingQuoteState =
  | { status: "loading" }
  | { status: "ready"; quote: ClientShippingQuote }
  | { status: "error" };

export function useShippingQuote(items: Array<{ variantId: string; quantity: number }>): ShippingQuoteState {
  const key = items
    .map((i) => `${i.variantId}:${i.quantity}`)
    .sort()
    .join("|");
  const [state, setState] = useState<{ key: string; value: ShippingQuoteState }>({
    key: "",
    value: { status: "loading" },
  });

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    const body = JSON.stringify({
      items: key.split("|").map((part) => {
        const [variantId, quantity] = part.split(":");
        return { variantId, quantity: Number(quantity) };
      }),
    });
    const timer = window.setTimeout(() => {
      fetch("/api/shipping/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: ctrl.signal,
        cache: "no-store",
      })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<{ quote: ClientShippingQuote }>;
        })
        .then((d) => setState({ key, value: { status: "ready", quote: d.quote } }))
        .catch((err) => {
          if (ctrl.signal.aborted) return;
          console.error("[shipping] Kargo ücreti alınamadı:", err);
          setState({ key, value: { status: "error" } });
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [key]);

  // Sepet değiştiyse eski sonucu gösterme (yanlış tutar görünmesin)
  return state.key === key ? state.value : { status: "loading" };
}
