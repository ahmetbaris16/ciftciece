"use client";

/**
 * Müşterinin iptal / iade talebi: iki açık seçenek. "Kabul et" talebi elle kapatmaz, ilgili işleme götürür (iade kaydı
 * ya da "İptal et"); talep o işlemle kendiliğinden kapanır. "Reddet" talebi kapatır, sipariş sürer; müşteriye e-posta
 * gider ve sipariş sayfasında görür (yazılan sebep ikisinde de yazar).
 */

import { useState } from "react";
import { useAdminRequest } from "./useAdminRequest";
import f from "./forms.module.css";

export default function RequestActions({
  requestId,
  type,
  acceptHref,
}: {
  requestId: string;
  type: "CANCEL" | "RETURN";
  /** Kabul için gidilecek bölüm (#iade ya da #siradaki-adim) */
  acceptHref: string;
}) {
  const { busy, error, send } = useAdminRequest();
  const [note, setNote] = useState("");
  const what = type === "CANCEL" ? "İptali" : "İadeyi";

  const reject = () => {
    const question =
      (type === "CANCEL" ? "İptal isteği reddedilsin mi? Sipariş İPTAL EDİLMEZ, devam eder." : "İade bildirimi reddedilsin mi?") +
      " Müşteriye e-posta gider ve sipariş sayfasında da görür." +
      (note.trim().length < 3 ? "\n\nSebep yazmadınız; e-postada sebep yazmaz. Sebep yazmanız önerilir." : "");
    if (!window.confirm(question)) return;
    void send(`/api/admin/requests/${requestId}`, { status: "REJECTED", note: note.trim() || null }, { method: "PATCH" });
  };

  return (
    <div className={f.form}>
      <div className={f.actions}>
        <a className={f.primary} href={acceptHref}>
          {what} kabul et
        </a>
        <button type="button" className={f.danger} disabled={busy} onClick={reject}>
          {what} reddet ({type === "CANCEL" ? "sipariş devam eder" : "iade yapılmaz"})
        </button>
      </div>
      <input
        className={f.input}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reddederseniz sebebi (müşteriye e-postayla gider; ör. ürün kargoya verilmişti)"
        maxLength={2000}
        aria-label="Ret sebebi (müşteriye gider)"
      />
      {error && <p className={f.error}>{error}</p>}
    </div>
  );
}
