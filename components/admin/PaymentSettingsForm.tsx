"use client";

/**
 * Admin — Ödeme yöntemleri
 *  - Kart (Akbank Sanal POS): açık/kapalı + durum (demo / test / canlı) ve canlıya geçiş adımları. Banka bilgileri
 *    sunucu ortam değişkenlerinde (hPanel); burada yalnız durum gösterilir.
 *  - Havale/EFT: banka adı, hesap sahibi, IBAN, ödeme süresi. IBAN girilmeden müşteriye gösterilmez.
 *  - Kapıda ödeme: varsayılan kapalı; hizmet bedeli ve üst tutar sınırı.
 */

import { useState } from "react";
import { INSTALLMENT_CHOICES, formatIban, isValidTrIban, normalizeIban, type PaymentSettings } from "@/lib/payment/methods";
import type { ProviderStatus } from "@/lib/payment/provider";

const MODE_BADGE: Record<ProviderStatus["mode"], { label: string; color: string; bg: string }> = {
  off: { label: "KAPALI — ödeme sağlayıcısı ayarı geçersiz", color: "#f3a0a0", bg: "rgba(243,160,160,0.12)" },
  demo: { label: "DEMO — sanal POS bağlı değil, banka sayfası demo kopyası", color: "#e8c07a", bg: "rgba(232,192,122,0.12)" },
  test: { label: "TEST ORTAMI — gerçek para çekilmez", color: "#9ec5f0", bg: "rgba(158,197,240,0.12)" },
  live: { label: "CANLI — gerçek tahsilat", color: "#9fd39f", bg: "rgba(159,211,159,0.12)" },
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
  const [maxInstallment, setMaxInstallment] = useState(initial.card.maxInstallment);
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

  return (
    <div style={s.wrap}>
      <p style={s.summary} role="status">
        Müşteriye şu an gösterilen yöntemler:{" "}
        <strong>{visible.length ? visible.join(" · ") : "hiçbiri — çevrimiçi sipariş alınamaz"}</strong>
      </p>

      {/* Kart */}
      <fieldset style={s.box}>
        <legend style={s.legend}>Kredi / Banka Kartı ({provider.name})</legend>
        <p style={{ ...s.badge, color: MODE_BADGE[provider.mode].color, background: MODE_BADGE[provider.mode].bg }}>
          {MODE_BADGE[provider.mode].label}
        </p>
        <p style={s.hint}>{provider.note}</p>
        <label style={s.check}>
          <input type="checkbox" checked={cardEnabled} onChange={(e) => setCardEnabled(e.target.checked)} />
          Kartla ödeme seçeneğini ödeme sayfasında göster
        </label>
        {provider.mode === "demo" && (
          <div style={s.demoBox}>
            <p style={{ ...s.hint, color: "rgba(232,228,217,0.75)" }}>
              <strong>Banka sunumu / deneme:</strong> bu tarayıcıda yönetici girişi açıkken mağazadan sipariş verin, ödeme
              yönteminde “Kredi / Banka Kartı (DEMO)” seçin. Bankanın ödeme sayfasının demo kopyası açılır: kart bilgileri
              girilir (“Test kartıyla doldur”), telefona gelmiş gibi gösterilen 6 haneli kod yazılır, sipariş “Ödendi” olarak
              Siparişler’e düşer. Gerçek para çekilmez; siparişte “Demo ödeme” uyarısı görünür.
            </p>
            <p style={s.hint}>
              Müşteriler bu sırada kart seçeneğini “Kartla ödeme çok yakında” notuyla görür, seçemez. Akbank bilgileri hPanel’e
              girilince demo kendiliğinden kapanır.
            </p>
          </div>
        )}
        <details style={s.details}>
          <summary style={s.summaryToggle}>Akbank sanal POS bağlama ve canlıya geçiş adımları</summary>
          <ol style={s.steps}>
            <li>Akbank&apos;tan sanal POS bilgilerini alın: Güvenli İş Yeri No (merchantSafeId), Terminal Safe ID ve gizli anahtar (Akbank POS portalı → Yönetim).</li>
            <li>
              hPanel → Node.js uygulaması → Ortam değişkenleri: <code>PAYMENT_PROVIDER=akbank</code>,{" "}
              <code>AKBANK_MERCHANT_SAFE_ID</code>, <code>AKBANK_TERMINAL_SAFE_ID</code>, <code>AKBANK_SECRET_KEY</code>,{" "}
              <code>AKBANK_ENV=test</code>. Kaydedince site yeniden başlar; bu sayfada “TEST ORTAMI” görünür.
            </li>
            <li>Yönetici girişi açıkken sitede bir test siparişi verin, Akbank&apos;ın test kartıyla ödeyin; sipariş “Ödendi” olmalı. Başarısız kart da deneyin.</li>
            <li>Sorun yoksa canlı bilgileri girip <code>AKBANK_ENV=prod</code> yapın. Bu sayfada “CANLI” görünür; kartla ödeme herkese açılır.</li>
          </ol>
          <p style={s.hint}>Ayrıntı: docs/AKBANK_TEST.md ve docs/YAYIN.md. Banka bilgileri asla bu panele ya da koda yazılmaz.</p>
        </details>
        <label style={s.field}>
          <span style={s.label}>En yüksek taksit</span>
          <select
            style={s.input}
            value={maxInstallment}
            onChange={(e) => setMaxInstallment(Number(e.target.value))}
            disabled={provider.name.startsWith("Akbank")}
          >
            {INSTALLMENT_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "Yalnız tek çekim" : `${n} taksite kadar`}
              </option>
            ))}
          </select>
          <span style={s.hint}>
            {provider.name.startsWith("Akbank")
              ? "Akbank ödeme sayfasında şimdilik tek çekim. Taksit, Akbank'tan taksit yetkisi ve teknik doküman gelince açılır."
              : "Vade farkını müşteriye yansıtıp yansıtmamayı ödeme kuruluşunun panelinden ayarlarsınız."}
          </span>
        </label>
      </fieldset>

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
            <span style={s.label}>Hesap sahibi (ad soyad / unvan)</span>
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
        <p style={s.hint}>
          Müşteri siparişten sonra IBAN’ı ve açıklamaya yazacağı sipariş numarasını görür. Parayı gördüğünüzde sipariş
          sayfasında <strong>“Havale ödemesi alındı”</strong> deyin. Süresinde ödenmeyen sipariş kendiliğinden iptal olur,
          stok geri döner. Bilgiler eksikken müşteriye gösterilmez.
        </p>
      </fieldset>

      {/* Kapıda ödeme */}
      <fieldset style={s.box}>
        <legend style={s.legend}>Kapıda Ödeme</legend>
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
        <p style={s.hint}>
          Açmadan önce Yurtiçi Kargo ile “tahsilatlı teslimat” anlaşması yapın. Teslim alınmayan paketin gidiş-dönüş
          kargosu size kalır; bunu dengelemek için hizmet bedeli ve üst sınır koyabilirsiniz. Kapıda ödemeli sipariş
          doğrudan “Hazırlanıyor” olarak düşer.
        </p>
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
  badge: { margin: 0, padding: "0.375rem 0.625rem", borderRadius: 6, fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.03em", alignSelf: "flex-start" },
  details: { border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "0.5rem 0.75rem" },
  demoBox: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
    padding: "0.625rem 0.75rem",
    borderRadius: 6,
    background: "rgba(232,192,122,0.06)",
    border: "1px solid rgba(232,192,122,0.18)",
  },
  summaryToggle: { cursor: "pointer", fontSize: "0.8125rem", color: "#e8e4d9" },
  steps: { margin: "0.5rem 0 0.5rem 1.1rem", padding: 0, fontSize: "0.8125rem", lineHeight: 1.6, color: "rgba(232,228,217,0.75)" },
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
