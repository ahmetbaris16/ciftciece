"use client";

/**
 * Ödeme sayfasındaki yöntemler (/api/payment/methods). Gösterim içindir; seçim sipariş anında sunucuda
 * yeniden doğrulanır.
 */

import { useEffect, useState } from "react";
import type { PaymentOption } from "./methods";

export type PaymentOptionsState =
  | { status: "loading" }
  | { status: "ready"; options: PaymentOption[] }
  | { status: "error" };

export function usePaymentOptions(): PaymentOptionsState {
  const [state, setState] = useState<PaymentOptionsState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    fetch("/api/payment/methods", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ options: PaymentOption[] }>;
      })
      .then((d) => alive && setState({ status: "ready", options: d.options }))
      .catch((err) => {
        console.error("[payment] Ödeme seçenekleri alınamadı:", err);
        if (alive) setState({ status: "error" });
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
