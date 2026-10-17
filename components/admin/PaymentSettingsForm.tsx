"use client";

/**
 * Admin — Ödeme yöntemleri
 *  - Havale/EFT: yeni siparişte KAPALI (2026-10-16); kayıtlı hesap bilgisi eski havale siparişleri için değişmeden saklanır.
 *  - Kart (Akbank Sanal POS): göster/gizle + durum (demo / test / canlı). Banka bilgileri sunucu ortam
 *    değişkenlerinde (hPanel; kurulum: docs/YAYIN.md, docs/AKBANK_TEST.md); burada yalnız durum görünür.
 * Kapıda ödeme sunulmaz (işletme kararı, 2026-10-07).
 */

import { useState } from "react";
import type { PaymentSettings } from "@/lib/payment/methods";
import type { ProviderStatus } from "@/lib/payment/provider";

const CARD_STATUS: Record<ProviderStatus["mode"], { label: string; color: string; text: string }> = {
  off: { label: "Kapalı", color: "#f3a0a0", text: "Ödeme sağlayıcısı ayarı geçersiz; müşteriler kartı “yakında” görür." },
  demo: {
    label: "Demo",
    color: "#e8c07a",
    text: "Sanal POS henüz bağlı değil. Müşteriler kartı “yakında” görür; siz yönetici girişiyle demo ödeme deneyebilirsiniz.",
  },
  test: { label: "Test", color: "#9ec5f0", text: "Banka test ortamı: kartı yalnız siz görürsünüz, gerçek para çekilmez." },
  live: { label: "Canlı", color: "#9fd39f", text: "Kartla ödemeler gerçek tahsilattır." },
};

export default function PaymentSettingsForm({
  initial,
  provider,
}: {
  initial: PaymentSettings;
  provider: ProviderStatus;
}) {
  const [cardEnabled, setCardEnabled] = useState(initial.card.enabled);
  const maxInstallment = initial.card.maxInstallment;
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const visible = [
    cardEnabled && provider.mode === "live" && "Kart",
    cardEnabled && provider.mode !== "live" && "Kart (müşteriye “yakında”, seçilemez)",
  ].filter(Boolean) as string[];

  const save = async () => {
    setStatus(null);
    const err = (text: string) => setStatus({ kind: "error", text });

    setSaving(true);
    try {
      const res = await fetch("/api/admin/payment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card: { enabled: cardEnabled, maxInstallment },
          // Havale ayarı değişmeden geri yazılır (eski havale siparişleri hesap bilgisini kullanır)
          bankTransfer: initial.bankTransfer,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return err(data?.error ?? "Kaydedilemedi.");
      setStatus({ kind: "ok", text: "Ödeme ayarları kaydedildi." });
    } catch {
      err("Bağlantı hatası. Tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  const card = CARD_STATUS[provider.mode];

  return (
    <div style={s.wrap}>
      <p style={s.summary} role="status">
        Müşteriye açık: <strong>{visible.length ? visible.join(" · ") : "hiçbiri — çevrimiçi sipariş alınamaz"}</strong>
      </p>

      <p style={s.hint}>
        Havale/EFT ile yeni sipariş alınmıyor. Daha önce havale ile verilmiş siparişler eskisi gibi takip edilir; kayıtlı hesap
        bilgisi onlar için saklanır.
      </p>

      {/* Kart */}
      <fieldset style={s.box}>
        <legend style={s.legend}>Kredi / Banka kartı</legend>
        <p style={s.cardStatus}>
          <span style={{ ...s.badge, color: card.color, background: `${card.color}1f` }}>{card.label}</span>
          <span style={s.hint}>{card.text}</span>
        </p>
        <label style={s.check}>
          <input type="checkbox" checked={cardEnabled} onChange={(e) => setCardEnabled(e.target.checked)} />
          Kartla ödeme seçeneğini ödeme sayfasında göster
        </label>
      </fieldset>

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
  wrap: { display: "flex", flexDirection: "column", gap: "1rem" },
  summary: { margin: 0, fontSize: "0.8125rem", color: "rgba(232,228,217,0.75)" },
  box: {
    display: "flex",
    flexDirection: "column",
    gap: "0.625rem",
    margin: 0,
    padding: "0.875rem 1rem 1rem",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
  },
  legend: { padding: "0 0.375rem", fontSize: "0.875rem", fontWeight: 600, color: "#e8e4d9" },
  check: { display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.8125rem", color: "#e8e4d9" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" },
  field: { display: "flex", flexDirection: "column", gap: "0.375rem", minWidth: 0 },
  label: { fontSize: "0.8125rem", color: "rgba(232,228,217,0.7)" },
  hint: { fontSize: "0.75rem", color: "rgba(232,228,217,0.45)", margin: 0, lineHeight: 1.5 },
  input: {
    padding: "0.5rem 0.625rem",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 6,
    color: "#e8e4d9",
    fontSize: "0.875rem",
    minWidth: 0,
  },
  footer: { display: "flex", alignItems: "center", gap: "1rem" },
  badge: { flexShrink: 0, padding: "0.15rem 0.55rem", borderRadius: 999, fontSize: "0.75rem", fontWeight: 700 },
  cardStatus: { display: "flex", alignItems: "center", gap: "0.6rem", margin: 0 },
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
