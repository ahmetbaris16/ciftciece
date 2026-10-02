"use client";

/** İç not: sipariş geçmişine eklenir, müşteri görmez. */

import { useState } from "react";
import { useAdminRequest } from "./useAdminRequest";
import f from "./forms.module.css";

export default function NoteForm({ orderId }: { orderId: string }) {
  const { busy, error, send } = useAdminRequest();
  const [message, setMessage] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await send(`/api/admin/orders/${orderId}/note`, { message: message.trim() }, { success: "Not eklendi." })) setMessage("");
  };

  return (
    <form className={f.form} onSubmit={submit} noValidate>
      <label className={f.field}>
        <span className={f.label}>İç not (müşteri görmez)</span>
        <textarea
          className={f.textarea}
          style={{ minHeight: 70 }}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          placeholder="ör. müşteri aradı, kargo cuma çıkacak"
        />
      </label>
      <div className={f.actions}>
        <button type="submit" className={f.secondary} disabled={busy || message.trim().length < 2}>
          {busy ? "Ekleniyor…" : "Not ekle"}
        </button>
        {error && <p className={f.error}>{error}</p>}
      </div>
    </form>
  );
}
