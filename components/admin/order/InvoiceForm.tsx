"use client";

/**
 * e-Arşiv fatura numarası: fatura muhasebe/GİB portalında düzenlenir, numarası buraya yazılır. Müşteri sipariş
 * sayfasında görür. Fatura PDF'i bu sürümde siteden gönderilmez.
 */

import { useState } from "react";
import { useAdminRequest } from "./useAdminRequest";
import f from "./forms.module.css";

const todayIstanbul = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export default function InvoiceForm({ orderId, current }: { orderId: string; current: string | null }) {
  const { busy, error, done, send } = useAdminRequest();
  const [open, setOpen] = useState(!current);
  const [number, setNumber] = useState(current ?? "");
  const [date, setDate] = useState(todayIstanbul);

  if (!open) {
    return (
      <button type="button" className={f.link} onClick={() => setOpen(true)}>
        Fatura numarasını değiştir
      </button>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await send(`/api/admin/orders/${orderId}/invoice`, { invoiceNumber: number.trim(), issuedAt: date || undefined }, { success: "Fatura numarası kaydedildi." });
    if (ok && current) setOpen(false);
  };

  return (
    <form className={f.form} onSubmit={submit} noValidate>
      <div className={f.row}>
        <label className={f.field}>
          <span className={f.label}>Fatura no</span>
          <input
            className={f.input}
            value={number}
            onChange={(e) => setNumber(e.target.value.toUpperCase())}
            placeholder="ör. CEA2026000000123"
            maxLength={60}
            autoComplete="off"
          />
        </label>
        <label className={f.field}>
          <span className={f.label}>Fatura tarihi</span>
          <input className={f.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <div className={f.actions}>
        <button type="submit" className={f.secondary} disabled={busy || number.trim().length < 3}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
        {error && <p className={f.error}>{error}</p>}
        {done && <p className={f.ok}>{done}</p>}
      </div>
    </form>
  );
}
