"use client";

/**
 * E-postalar sayfası araçları: ayarları denemek için deneme e-postası (doğrudan, sonucu hemen görünür) ve
 * kuyruktakileri şimdi gönder (zamanlanmış işi beklemeden).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import f from "./order/forms.module.css";

interface RunResult {
  dispatch: { processed: number; emails: number; failed: number };
  send: { sent: number; failed: number; retried: number; notConfigured: boolean };
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; data: { error?: string; result?: unknown } | null }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: await res.json().catch(() => null) };
}

export default function EmailTools({ defaultTo, showRun = true }: { defaultTo: string; showRun?: boolean }) {
  const router = useRouter();
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState<"test" | "run" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const sendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("test");
    setMessage(null);
    try {
      const { ok, data } = await post("/api/admin/emails/test", { to: to.trim() });
      const mode = (data?.result as { mode?: string } | undefined)?.mode;
      setMessage(
        ok
          ? {
              ok: true,
              text:
                mode === "dev-outbox"
                  ? "Geliştirme kipinde: e-posta gönderilmedi, .mock-data/outbox.json'a yazıldı."
                  : `Gönderildi. ${to.trim()} gelen kutusunu (ve gereksiz klasörünü) kontrol edin.`,
            }
          : { ok: false, text: data?.error ?? "Gönderilemedi." }
      );
    } catch {
      setMessage({ ok: false, text: "Bağlantı hatası. Tekrar deneyin." });
    } finally {
      setBusy(null);
    }
  };

  const runNow = async () => {
    setBusy("run");
    setMessage(null);
    try {
      const { ok, data } = await post("/api/admin/emails/run", {});
      if (!ok) {
        setMessage({ ok: false, text: data?.error ?? "Çalıştırılamadı." });
        return;
      }
      const r = data?.result as RunResult;
      setMessage(
        r.send.notConfigured
          ? { ok: false, text: "E-posta gönderimi ayarlı değil; e-postalar kuyrukta bekliyor." }
          : {
              ok: r.send.failed === 0,
              text: `${r.send.sent} e-posta gönderildi${r.send.retried ? `, ${r.send.retried} tanesi sonra yeniden denenecek` : ""}${r.send.failed ? `, ${r.send.failed} tanesi gönderilemedi` : ""}.`,
            }
      );
      router.refresh();
    } catch {
      setMessage({ ok: false, text: "Bağlantı hatası. Tekrar deneyin." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={f.form}>
      <form className={f.actions} onSubmit={sendTest} noValidate>
        <input
          className={f.input}
          style={{ flex: "1 1 240px", width: "auto" }}
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Deneme e-postasının gideceği adres"
          aria-label="Deneme e-postası adresi"
        />
        <button type="submit" className={f.secondary} disabled={busy !== null || !to.trim()}>
          {busy === "test" ? "Gönderiliyor…" : "Deneme e-postası gönder"}
        </button>
        {showRun && (
          <button type="button" className={f.primary} onClick={runNow} disabled={busy !== null}>
            {busy === "run" ? "Gönderiliyor…" : "Kuyruktakileri şimdi gönder"}
          </button>
        )}
      </form>
      {message && <p className={message.ok ? f.ok : f.error}>{message.text}</p>}
    </div>
  );
}
