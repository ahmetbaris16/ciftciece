"use client";

/**
 * Kargoya ver: takip numarası zorunlu (R-22). Müşteriye takip bağlantılı e-posta gider. Sipariş zaten
 * kargodaysa aynı form ek koli (ikinci takip numarası) ekler.
 *
 * Takip numarası yazılırken denetlenir: Yurtiçi gönderi kodu yalnız rakam, çoğunlukla 12 hane (11–14 olabilir;
 * lib/shipping/carriers.ts). Uymayan numara (ör. harf içeren ya da 39 karakterlik) "Numara doğru" onayı olmadan
 * kaydedilmez — yanlış yazım müşteriye gitmesin, gerçek ama farklı bir numara da kargolamayı durdurmasın.
 */

import { useState } from "react";
import {
  CARRIERS,
  TRACKING_RULE_TEXT,
  carrierByName,
  isValidTrackingNumber,
  normalizeTrackingNumber,
  trackingFormatIssue,
} from "@/lib/shipping/carriers";
import { useAdminRequest } from "./useAdminRequest";
import f from "./forms.module.css";

const OTHER = "__other";

export default function ShipForm({ orderId, additional }: { orderId: string; additional: boolean }) {
  const { busy, error, done, send, setError } = useAdminRequest();
  const [carrier, setCarrier] = useState(CARRIERS[0].name);
  const [otherName, setOtherName] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [tracking, setTracking] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const name = carrier === OTHER ? otherName.trim() : carrier;
  const format = carrier === OTHER ? undefined : carrierByName(carrier)?.trackingFormat;
  const number = normalizeTrackingNumber(tracking, name);
  const valid = isValidTrackingNumber(number);
  // Firmanın olağan biçimine uymama açıklaması (geçersiz numarada da firmaya göre anlatılır)
  const formatText = format ? trackingFormatIssue(name, number) : null;
  const issue = valid ? formatText : null;
  const invalidText = formatText ?? TRACKING_RULE_TEXT;

  // Yazarken gösterilen durum: biçime uyuyor mu, kaç hane
  let status: { kind: "hint" | "ok" | "warn"; text: string };
  if (!tracking.trim()) {
    status = { kind: "hint", text: format?.hint ?? TRACKING_RULE_TEXT };
  } else if (!valid) {
    status = { kind: "warn", text: invalidText };
  } else if (issue) {
    status = { kind: "warn", text: issue };
  } else {
    status = { kind: "ok", text: format ? `${number.length} hane — gönderi kodu biçiminde.` : `${number.length} karakter.` };
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) {
      setError(`Takip numarasını kontrol edin. ${invalidText}`);
      return;
    }
    if (name.length < 2) {
      setError("Kargo firmasının adını yazın.");
      return;
    }
    if (issue && !confirmed) {
      setError("Numara olağan biçime uymuyor. Fişteki numarayla karşılaştırın; doğruysa “Numara doğru” kutusunu işaretleyin.");
      return;
    }
    const ok = await send(
      `/api/admin/orders/${orderId}/ship`,
      {
        carrier: name,
        trackingNumber: number,
        trackingUrl: carrier === OTHER && trackingUrl.trim() ? trackingUrl.trim() : null,
        ...(issue && confirmed ? { confirmUnusual: true } : {}),
      },
      { success: additional ? "Ek koli eklendi; müşteriye e-posta gidiyor." : "Kargoya verildi; müşteriye takip e-postası gidiyor." }
    );
    if (ok) {
      setTracking("");
      setConfirmed(false);
    }
  };

  const statusId = `ship-status-${additional ? "ek" : "ilk"}`;

  return (
    <form className={f.form} onSubmit={submit} noValidate>
      <div className={f.row}>
        <label className={f.field}>
          <span className={f.label}>Kargo firması</span>
          <select
            className={f.select}
            value={carrier}
            onChange={(e) => {
              setCarrier(e.target.value);
              setConfirmed(false);
            }}
          >
            {CARRIERS.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
            <option value={OTHER}>Diğer</option>
          </select>
        </label>
        <label className={f.field}>
          <span className={f.label}>{format ? "Takip numarası (gönderi kodu)" : "Takip numarası"}</span>
          <input
            className={f.input}
            value={tracking}
            onChange={(e) => {
              setTracking(e.target.value);
              setConfirmed(false);
            }}
            inputMode={format?.digitsOnly ? "numeric" : "text"}
            autoComplete="off"
            spellCheck={false}
            maxLength={format?.digitsOnly ? 24 : 48}
            placeholder={format?.digitsOnly ? "12 haneli gönderi kodu" : "Gönderi barkodundaki numara"}
            aria-describedby={statusId}
            aria-invalid={status.kind === "warn" ? true : undefined}
            required
            data-testid="ship-tracking"
          />
          <span
            id={statusId}
            className={`${f.status} ${status.kind === "ok" ? f.statusOk : status.kind === "warn" ? f.statusWarn : ""}`}
            aria-live="polite"
            data-testid="ship-tracking-status"
          >
            {status.text}
          </span>
        </label>
      </div>
      {issue && (
        <label className={f.check}>
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-testid="ship-confirm-unusual" />
          <span>
            Numara doğru: kargo fişindeki numarayla tek tek karşılaştırdım (<strong>{number}</strong>).
          </span>
        </label>
      )}
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
