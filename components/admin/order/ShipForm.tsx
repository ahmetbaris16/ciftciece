"use client";

/**
 * Kargoya ver: takip numarası zorunlu (R-22). Müşteriye takip bağlantılı e-posta gider. Sipariş zaten
 * kargodaysa aynı form ek koli (ikinci takip numarası) ekler.
 */

import { useState } from "react";
import { CARRIERS, normalizeTrackingNumber, isValidTrackingNumber } from "@/lib/shipping/carriers";
import { useAdminRequest } from "./useAdminRequest";
import f from "./forms.module.css";

const OTHER = "__other";

export default function ShipForm({ orderId, additional }: { orderId: string; additional: boolean }) {
  const { busy, error, done, send, setError } = useAdminRequest();
  const [carrier, setCarrier] = useState(CARRIERS[0].name);
  const [otherName, setOtherName] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [tracking, setTracking] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const number = normalizeTrackingNumber(tracking);
    if (!isValidTrackingNumber(number)) {
      setError("Takip numarasını kontrol edin (6–40 harf/rakam).");
      return;
    }
    const name = carrier === OTHER ? otherName.trim() : carrier;
    if (name.length < 2) {
      setError("Kargo firmasının adını yazın.");
      return;
    }
    const ok = await send(
      `/api/admin/orders/${orderId}/ship`,
      { carrier: name, trackingNumber: number, trackingUrl: carrier === OTHER && trackingUrl.trim() ? trackingUrl.trim() : null },
      { success: additional ? "Ek koli eklendi; müşteriye e-posta gidiyor." : "Kargoya verildi; müşteriye takip e-postası gidiyor." }
    );
    if (ok) setTracking("");
  };

  return (
    <form className={f.form} onSubmit={submit} noValidate>
      <div className={f.row}>
        <label className={f.field}>
          <span className={f.label}>Kargo firması</span>
          <select className={f.select} value={carrier} onChange={(e) => setCarrier(e.target.value)}>
            {CARRIERS.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
            <option value={OTHER}>Diğer</option>
          </select>
        </label>
        <label className={f.field}>
          <span className={f.label}>Takip numarası</span>
          <input
            className={f.input}
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            inputMode="text"
            autoComplete="off"
            placeholder="Gönderi barkodundaki numara"
            required
          />
        </label>
      </div>
      {carrier === OTHER && (
        <div className={f.row}>
          <label className={f.field}>
            <span className={f.label}>Firma adı</span>
            <input className={f.input} value={otherName} onChange={(e) => setOtherName(e.target.value)} maxLength={60} />
          </label>
          <label className={f.field}>
            <span className={f.label}>Takip bağlantısı (isteğe bağlı)</span>
            <input
              className={f.input}
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
              placeholder="https://"
              inputMode="url"
            />
          </label>
        </div>
      )}
      <div className={f.actions}>
        <button type="submit" className={f.primary} disabled={busy}>
          {busy ? "Kaydediliyor…" : additional ? "Ek koli ekle" : "Kargoya verildi olarak işaretle"}
        </button>
        {error && <p className={f.error}>{error}</p>}
        {done && <p className={f.ok}>{done}</p>}
      </div>
      <p className={f.hint}>Müşteriye takip numarası ve takip bağlantısıyla e-posta gider; sipariş sayfasında da görünür.</p>
    </form>
  );
}
