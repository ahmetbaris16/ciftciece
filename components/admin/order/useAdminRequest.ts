"use client";

/**
 * Admin formları için ortak istek: JSON gönderir, sunucunun anlaşılır hata mesajını gösterir, başarıda sayfa
 * verisini yeniler (router.refresh). 409 (sipariş bu arada başka duruma geçti, ör. başka sekmede) da sayfayı yeniler:
 * eski sayfa güncel durumu göstersin.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

export function useAdminRequest() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function send(
    url: string,
    body: unknown,
    opts: { method?: string; success?: string | ((result: unknown) => string) } = {}
  ): Promise<boolean> {
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
        if (res.status === 409) router.refresh();
        return false;
      }
      setDone(typeof opts.success === "function" ? opts.success(data?.result) : (opts.success ?? "Kaydedildi."));
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
