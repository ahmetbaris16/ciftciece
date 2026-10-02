"use client";

/**
 * İletişim mesajı işlemleri: okundu / arşivle / geri al ve işletmenin e-posta adresinden yanıt. Yanıt
 * kuyruktan gider; aynı form açılışında çift gönderim olmaz (tek kullanımlık anahtar).
 */

import { useState } from "react";
import { useAdminRequest } from "./order/useAdminRequest";
import f from "./order/forms.module.css";

type Status = "NEW" | "READ" | "ANSWERED" | "ARCHIVED";

const newNonce = () => crypto.randomUUID();

export default function MessageActions({ id, status, email }: { id: string; status: Status; email: string }) {
  const { busy, error, done, send, setError } = useAdminRequest();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [nonce, setNonce] = useState(newNonce);

  const setStatus = (to: Status) => void send(`/api/admin/messages/${id}`, { status: to }, { method: "PATCH", success: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reply.trim().length < 5) {
      setError("Yanıtı yazın.");
      return;
    }
    if (!window.confirm(`Yanıt ${email} adresine gönderilsin mi?`)) return;
    const ok = await send(
      `/api/admin/messages/${id}/reply`,
      { message: reply.trim(), nonce },
      { success: "Yanıt kuyruğa alındı; birkaç saniye içinde gider." }
    );
    if (ok) {
      setReply("");
      setReplying(false);
      setNonce(newNonce());
    }
  };

  return (
    <div className={f.form}>
      <div className={f.actions}>
        {!replying && (
          <button type="button" className={f.primary} onClick={() => setReplying(true)} disabled={busy}>
            Yanıtla
          </button>
        )}
        {status === "NEW" && (
          <button type="button" className={f.secondary} onClick={() => setStatus("READ")} disabled={busy}>
            Okundu
          </button>
        )}
        {status !== "ARCHIVED" ? (
          <button type="button" className={f.secondary} onClick={() => setStatus("ARCHIVED")} disabled={busy}>
            Arşivle
          </button>
        ) : (
          <button type="button" className={f.secondary} onClick={() => setStatus("READ")} disabled={busy}>
            Arşivden çıkar
          </button>
        )}
        {error && <p className={f.error}>{error}</p>}
        {done && <p className={f.ok}>{done}</p>}
      </div>
      {replying && (
        <form className={f.form} onSubmit={submit} noValidate>
          <label className={f.field}>
            <span className={f.label}>Yanıtınız ({email})</span>
            <textarea className={f.textarea} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={5000} rows={6} autoFocus />
          </label>
          <p className={f.hint}>“Merhaba {"{ad}"},” selamı ve müşterinin mesajı (alıntı olarak) otomatik eklenir.</p>
          <div className={f.actions}>
            <button type="submit" className={f.primary} disabled={busy}>
              {busy ? "Gönderiliyor…" : "Yanıtı gönder"}
            </button>
            <button type="button" className={f.link} onClick={() => setReplying(false)}>
              Vazgeç
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
