"use client";

/**
 * Admin — Kargo: sabit kargo ücreti ve ücretsiz kargo sınırı (Yurtiçi Kargo, yalnız yurt içi).
 */

import { useState } from "react";
import { formatPrice } from "@/types";
import { parseTlInput } from "@/lib/payment/money";
import type { ShippingSettings } from "@/lib/shipping/settings";

const toTl = (kurus: number | null) => (kurus === null ? "" : (kurus / 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 }));

export default function ShippingSettingsForm({ initial }: { initial: ShippingSettings }) {
  const [fee, setFee] = useState(toTl(initial.feeKurus));
  const [threshold, setThreshold] = useState(toTl(initial.freeThresholdKurus));
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setStatus(null);
    const feeKurus = parseTlInput(fee);
    const freeThresholdKurus = parseTlInput(threshold);
    if (feeKurus === null) return setStatus({ kind: "error", text: "Kargo ücretini TL olarak yazın (ör. 150)." });
    if (freeThresholdKurus === null) return setStatus({ kind: "error", text: "Ücretsiz kargo sınırını TL olarak yazın (ör. 3000)." });

    setSaving(true);
    try {
      const res = await fetch("/api/admin/shipping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feeKurus, freeThresholdKurus }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return setStatus({ kind: "error", text: data?.error ?? "Kaydedilemedi." });
      const saved = data.result as ShippingSettings;
      setFee(toTl(saved.feeKurus));
      setThreshold(toTl(saved.freeThresholdKurus));
      setStatus({ kind: "ok", text: "Kaydedildi. Sepet ve ödeme sayfası yeni ücreti kullanır." });
    } catch {
      setStatus({ kind: "error", text: "Bağlantı hatası. Tekrar deneyin." });
    } finally {
      setSaving(false);
    }
  };

  const feePreview = parseTlInput(fee);
  const thresholdPreview = parseTlInput(threshold);

  return (
    <div style={s.wrap}>
      {initial.feeKurus === null && (
        <p style={s.warn} role="status">
          Kargo ücreti girilmedi. Girilene kadar siparişler alıcı ödemeli gider (müşteri kargoyu teslimatta öder).
        </p>
      )}
      <div style={s.grid}>
        <label style={s.field}>
          <span style={s.label}>Kargo ücreti (TL)</span>
          <input style={s.input} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="ör. 150" />
        </label>
        <label style={s.field}>
          <span style={s.label}>Ücretsiz kargo sınırı (TL)</span>
          <input style={s.input} inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="ör. 3000" />
        </label>
      </div>
      {feePreview !== null && thresholdPreview !== null && (
        <p style={s.hint}>
          Müşteri her siparişte {formatPrice(feePreview)} kargo öder; {formatPrice(thresholdPreview)} ve üzeri siparişlerde kargo ücretsiz.
          Gönderiler Yurtiçi Kargo ile, yalnız yurt içine.
        </p>
      )}
      <div style={s.footer}>
        <button type="button" style={s.primaryBtn} onClick={save} disabled={saving}>
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </button>
        {status && (
          <span role="status" style={{ color: status.kind === "ok" ? "#9fd39f" : "#f3a0a0", fontSize: "0.875rem" }}>
            {status.text}
          </span>
        )}
      </div>
    </div>
  );
}

const s = {
  wrap: { display: "flex", flexDirection: "column", gap: "0.875rem" },
  warn: {
    margin: 0,
    padding: "0.625rem 0.875rem",
    borderRadius: 8,
    fontSize: "0.8125rem",
    lineHeight: 1.5,
    background: "rgba(232,192,122,0.1)",
    border: "1px solid rgba(232,192,122,0.35)",
    color: "#e8c07a",
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", maxWidth: 520 },
  field: { display: "flex", flexDirection: "column", gap: "0.375rem", minWidth: 0 },
  label: { fontSize: "0.8125rem", color: "rgba(232,228,217,0.7)" },
  hint: { fontSize: "0.8125rem", color: "rgba(232,228,217,0.55)", margin: 0, lineHeight: 1.5 },
  input: {
    padding: "0.55rem 0.7rem",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    color: "#e8e4d9",
    fontSize: "0.9375rem",
    minWidth: 0,
    fontFamily: "inherit",
  },
  footer: { display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" },
  primaryBtn: {
    padding: "0.625rem 1.25rem",
    background: "#c4d68e",
    color: "#15180f",
    border: 0,
    borderRadius: 8,
    fontWeight: 600,
    fontSize: "0.875rem",
  },
} satisfies Record<string, React.CSSProperties>;
