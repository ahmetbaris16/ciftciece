"use client";

/**
 * Müşterinin iptal / iade talebini kapatır. Para iadesi ayrıca iade kaydıyla girilir; talebi "sonuçlandı"
 * yapmak para iade etmez.
 */

import { useState } from "react";
import { useAdminRequest } from "./useAdminRequest";
import f from "./forms.module.css";

export default function RequestActions({ requestId }: { requestId: string }) {
  const { busy, error, send } = useAdminRequest();
  const [note, setNote] = useState("");

  const close = (status: "RESOLVED" | "REJECTED") => {
    if (status === "REJECTED" && note.trim().length < 3) {
      if (!window.confirm("Sebep yazmadan reddedilsin mi? (Müşteriye ayrıca e-postayla açıklamanız önerilir.)")) return;
    }
    void send(`/api/admin/requests/${requestId}`, { status, note: note.trim() || null }, { method: "PATCH" });
  };

  return (
    <div className={f.form}>
      <input
        className={f.input}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Kısa not (ör. iade kaydı girildi / ürün açılmış)"
        maxLength={2000}
        aria-label="Talep notu"
      />
      <div className={f.actions}>
        <button type="button" className={f.primary} disabled={busy} onClick={() => close("RESOLVED")}>
          Sonuçlandı
        </button>
        <button type="button" className={f.danger} disabled={busy} onClick={() => close("REJECTED")}>
          Reddet
        </button>
        {error && <p className={f.error}>{error}</p>}
      </div>
    </div>
  );
}
