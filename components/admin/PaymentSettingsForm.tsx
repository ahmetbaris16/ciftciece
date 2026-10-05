"use client";

/**
 * Admin — Ödeme yöntemleri
 *  - Havale/EFT: banka adı, hesap sahibi, IBAN, ödeme süresi. IBAN girilmeden müşteriye gösterilmez.
 *  - Kapıda ödeme: varsayılan kapalı; hizmet bedeli ve üst tutar sınırı.
 *  - Kart (Akbank Sanal POS): göster/gizle + durum (demo / test / canlı). Banka bilgileri sunucu ortam
 *    değişkenlerinde (hPanel; kurulum: docs/YAYIN.md, docs/AKBANK_TEST.md); burada yalnız durum görünür.
 */

import { useState } from "react";
import { formatIban, isValidTrIban, normalizeIban, type PaymentSettings } from "@/lib/payment/methods";
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

const parseTl = (text: string): number | null => {
  const t = text.trim().replace(/\s/g, "");
  if (t === "") return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
};
const tl = (kurus: number | null) => (kurus === null ? "" : String(kurus / 100).replace(".", ","));

export default function PaymentSettingsForm({
  initial,
  provider,
}: {
  initial: PaymentSettings;
  provider: ProviderStatus;
}) {
  const [cardEnabled, setCardEnabled] = useState(initial.card.enabled);
  const maxInstallment = initial.card.maxInstallment;
  const [bankEnabled, setBankEnabled] = useState(initial.bankTransfer.enabled);
  const [bankName, setBankName] = useState(initial.bankTransfer.bankName);
  const [holder, setHolder] = useState(initial.bankTransfer.accountHolder);
  const [iban, setIban] = useState(initial.bankTransfer.iban ? formatIban(initial.bankTransfer.iban) : "");
  const [windowHours, setWindowHours] = useState(String(initial.bankTransfer.paymentWindowHours));
  const [codEnabled, setCodEnabled] = useState(initial.cashOnDelivery.enabled);
  const [codFee, setCodFee] = useState(tl(initial.cashOnDelivery.feeKurus));
  const [codMax, setCodMax] = useState(tl(initial.cashOnDelivery.maxOrderKurus));
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const ibanOk = iban.trim() === "" || isValidTrIban(iban);
  const bankReady = bankEnabled && isValidTrIban(iban) && holder.trim().length > 1 && bankName.trim().length > 1;
  const visible = [
    cardEnabled && provider.mode === "live" && "Kart",
    cardEnabled && provider.mode !== "live" && "Kart (müşteriye “yakında”, seçilemez)",
    bankReady && "Havale/EFT",
    codEnabled && "Kapıda ödeme",
  ].filter(Boolean) as string[];

  const save = async () => {
    setStatus(null);
    const err = (text: string) => setStatus({ kind: "error", text });
    if (!ibanOk) return err("IBAN geçersiz: TR ile başlayan 26 karakter olmalı ve kontrol hanesi tutmalı.");
    const hours = Number(windowHours);
    if (!Number.isInteger(hours) || hours < 6 || hours > 168) return err("Havale ödeme süresi 6–168 saat arasında olmalı.");
    const fee = parseTl(codFee);
    if (Number.isNaN(fee)) return err("Kapıda ödeme bedeli geçerli bir tutar olmalı.");
    const max = parseTl(codMax);
    if (Number.isNaN(max) || max === 0) return err("Kapıda ödeme üst sınırı geçerli bir tutar olmalı (boş = sınır yok).");

    setSaving(true);
    try {
      const res = await fetch("/api/admin/payment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card: { enabled: cardEnabled, maxInstallment },
          bankTransfer: {
            enabled: bankEnabled,
            bankName: bankName.trim(),
            accountHolder: holder.trim(),
            iban: normalizeIban(iban),
            paymentWindowHours: hours,
          },
          cashOnDelivery: { enabled: codEnabled, feeKurus: fee ?? 0, maxOrderKurus: max },
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

      {/* Havale */}
      <fieldset style={s.box}>
        <legend style={s.legend}>Havale / EFT</legend>
        <label style={s.check}>
          <input type="checkbox" checked={bankEnabled} onChange={(e) => setBankEnabled(e.target.checked)} />
          Havale/EFT ile ödemeyi sun
        </label>
        <div style={s.grid}>
          <label style={s.field}>
            <span style={s.label}>Banka adı</span>
            <input style={s.input} value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </label>
          <label style={s.field}>
            <span style={s.label}>Hesap sahibi</span>
            <input style={s.input} value={holder} onChange={(e) => setHolder(e.target.value)} />
          </label>
          <label style={{ ...s.field, gridColumn: "1 / -1" }}>
            <span style={s.label}>IBAN</span>
            <input
              style={{ ...s.input, fontFamily: "monospace", borderColor: ibanOk ? s.input.borderColor : "#f3a0a0" }}
              value={iban}
              placeholder="TR00 0000 0000 0000 0000 0000 00"
              onChange={(e) => setIban(e.target.value.toUpperCase())}
              onBlur={() => iban.trim() && setIban(formatIban(iban))}
              aria-invalid={!ibanOk}
            />
            {!ibanOk && <span style={{ ...s.hint, color: "#f3a0a0" }}>IBAN geçersiz görünüyor.</span>}
          </label>
          <label style={s.field}>
            <span style={s.label}>Ödeme süresi (saat)</span>
            <input style={s.input} inputMode="numeric" value={windowHours} onChange={(e) => setWindowHours(e.target.value)} />
          </label>
        </div>
        <p style={s.hint}>Bu sürede ödenmeyen sipariş kendiliğinden iptal olur, stok geri döner.</p>
      </fieldset>

      {/* Kapıda ödeme */}
      <fieldset style={s.box}>
        <legend style={s.legend}>Kapıda ödeme</legend>
        <label style={s.check}>
          <input type="checkbox" checked={codEnabled} onChange={(e) => setCodEnabled(e.target.checked)} />
          Kapıda ödemeyi sun
        </label>
        <div style={s.grid}>
          <label style={s.field}>
            <span style={s.label}>Hizmet bedeli (TL)</span>
            <input style={s.input} inputMode="decimal" value={codFee} placeholder="0" onChange={(e) => setCodFee(e.target.value)} />
          </label>
          <label style={s.field}>
            <span style={s.label}>En yüksek sipariş tutarı (TL)</span>
            <input style={s.input} inputMode="decimal" value={codMax} placeholder="Sınır yok" onChange={(e) => setCodMax(e.target.value)} />
          </label>
        </div>
        <p style={s.hint}>Açmadan önce Yurtiçi Kargo ile tahsilatlı teslimat anlaşması yapın.</p>
      </fieldset>

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
