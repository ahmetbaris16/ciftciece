"use client";

/**
 * Admin formları için ortak istek: JSON gönderir, sunucunun anlaşılır hata mesajını gösterir, başarıda sayfa
 * verisini yeniler (router.refresh).
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

export function useAdminRequest() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function send(url: string, body: unknown, opts: { method?: string; success?: string } = {}): Promise<boolean> {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(url, {
        method: opts.method ?? "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "İşlem yapılamadı.");
        return false;
      }
      setDone(opts.success ?? "Kaydedildi.");
      router.refresh();
      return true;
    } catch {
      setError("Bağlantı hatası. Tekrar deneyin.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, done, send, setError };
}
