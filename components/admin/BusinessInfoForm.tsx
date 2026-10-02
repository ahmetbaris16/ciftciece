"use client";

/**
 * Admin — İşletme (satıcı) bilgileri. Sitede altbilgi, İletişim sayfası, Ön Bilgilendirme Formu, Mesafeli
 * Satış Sözleşmesi ve müşteri e-postaları bu bilgileri kullanır. Bilgiler vergi levhası / ticaret sicili ve
 * ödeme kuruluşu (Akbank sanal POS) başvurusuyla birebir aynı yazılmalıdır.
 */

import { useState } from "react";
import {
  missingBusinessFields,
  parseBusinessInfo,
  taxNumberWarning,
  validateBusinessInfo,
  type BusinessInfo,
  type BusinessType,
} from "@/lib/business/info";

type Field = Exclude<keyof BusinessInfo, "type">;

export default function BusinessInfoForm({ initial }: { initial: BusinessInfo }) {
  const [form, setForm] = useState<BusinessInfo>(initial);
  const [saved, setSaved] = useState<BusinessInfo>(initial);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setStatus(null);
  };
  const setType = (type: BusinessType) => setForm((f) => ({ ...f, type }));

  const missing = missingBusinessFields(saved);
  const isPerson = form.type === "PERSON";

  const save = async () => {
    setStatus(null);
    const normalized = parseBusinessInfo(JSON.stringify(form));
    const errors = validateBusinessInfo(normalized);
    if (errors.length > 0) return setStatus({ kind: "error", text: errors[0] });
    const warning = taxNumberWarning(normalized.taxNumber);
    if (warning && !window.confirm(`${warning} Numarayı vergi levhasından kontrol edin. Yine de kaydedilsin mi?`)) return;

    setSaving(true);
    try {
      const res = await fetch("/api/admin/business", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalized),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.business) return setStatus({ kind: "error", text: data?.error ?? "Kaydedilemedi." });
      setForm(data.business);
      setSaved(data.business);
      setStatus({ kind: "ok", text: "İşletme bilgileri kaydedildi. Site birkaç saniye içinde güncellenir." });
    } catch {
      setStatus({ kind: "error", text: "Bağlantı hatası. Tekrar deneyin." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.wrap}>
      {missing.length > 0 ? (
        <p style={{ ...s.banner, ...s.bannerWarn }} role="status">
          <strong>Eksik:</strong> {missing.join(", ")}. Bu bilgiler sözleşmelerde ve İletişim sayfasında yasal olarak
          gereklidir; ödeme kuruluşu incelemesinden önce doldurun.
        </p>
      ) : (
        <p style={{ ...s.banner, ...s.bannerOk }} role="status">
          Yasal kimlik bilgileri tamam. Sözleşmelerde, İletişim sayfasında ve e-postalarda görünüyor.
        </p>
      )}

      <fieldset style={s.box}>
        <legend style={s.legend}>Satıcı kimliği</legend>
        <div style={s.radioRow} role="radiogroup" aria-label="İşletme türü">
          <label style={s.check}>
            <input type="radio" name="btype" checked={form.type === "PERSON"} onChange={() => setType("PERSON")} />
            Şahıs işletmesi (esnaf / tacir)
          </label>
          <label style={s.check}>
            <input type="radio" name="btype" checked={form.type === "COMPANY"} onChange={() => setType("COMPANY")} />
            Şirket (Ltd., A.Ş. …)
          </label>
        </div>
        <div style={s.grid}>
          <label style={{ ...s.field, gridColumn: "1 / -1" }}>
            <span style={s.label}>{isPerson ? "Ad-soyad (vergi levhasındaki)" : "Ticaret unvanı (tam)"}</span>
            <input style={s.input} value={form.legalName} onChange={set("legalName")} maxLength={200} />
          </label>
          <label style={s.field}>
            <span style={s.label}>Sitede görünen işletme adı</span>
            <input style={s.input} value={form.tradeName} onChange={set("tradeName")} maxLength={100} />
          </label>
          <label style={s.field}>
            <span style={s.label}>Vergi dairesi</span>
            <input style={s.input} value={form.taxOffice} onChange={set("taxOffice")} maxLength={80} placeholder="Orhangazi" />
          </label>
          <label style={s.field}>
            <span style={s.label}>{isPerson ? "Vergi no / T.C. kimlik no" : "Vergi kimlik no (10 hane)"}</span>
            <input style={s.input} inputMode="numeric" value={form.taxNumber} onChange={set("taxNumber")} maxLength={11} />
          </label>
          <label style={s.field}>
            <span style={s.label}>MERSİS no {isPerson && <em style={s.optional}>(varsa)</em>}</span>
            <input style={s.input} inputMode="numeric" value={form.mersisNo} onChange={set("mersisNo")} maxLength={16} />
          </label>
          <label style={s.field}>
            <span style={s.label}>Ticaret sicil no <em style={s.optional}>(varsa)</em></span>
            <input style={s.input} value={form.tradeRegistryNo} onChange={set("tradeRegistryNo")} maxLength={40} />
          </label>
          <label style={s.field}>
            <span style={s.label}>KEP adresi <em style={s.optional}>(varsa)</em></span>
            <input style={s.input} value={form.kepAddress} onChange={set("kepAddress")} maxLength={120} placeholder="unvan@hs01.kep.tr" />
          </label>
          <label style={{ ...s.field, gridColumn: "1 / -1" }}>
            <span style={s.label}>Kayıtlı olunan meslek odası <em style={s.optional}>(varsa)</em></span>
            <input
              style={s.input}
              value={form.chamber}
              onChange={set("chamber")}
              maxLength={160}
              placeholder="ör. Orhangazi Esnaf ve Sanatkârlar Odası / Bursa Ticaret ve Sanayi Odası"
            />
          </label>
        </div>
      </fieldset>

      <fieldset style={s.box}>
        <legend style={s.legend}>İletişim</legend>
        <div style={s.grid}>
          <label style={{ ...s.field, gridColumn: "1 / -1" }}>
            <span style={s.label}>Açık adres (merkez / tebligat adresi)</span>
            <textarea style={{ ...s.input, minHeight: 64 }} value={form.address} onChange={set("address")} maxLength={300} />
          </label>
          <label style={s.field}>
            <span style={s.label}>Telefon</span>
            <input style={s.input} inputMode="tel" value={form.phone} onChange={set("phone")} maxLength={20} />
          </label>
          <label style={s.field}>
            <span style={s.label}>WhatsApp (ülke koduyla)</span>
            <input style={s.input} inputMode="tel" value={form.whatsapp} onChange={set("whatsapp")} maxLength={20} placeholder="905326825372" />
          </label>
          <label style={s.field}>
            <span style={s.label}>E-posta (müşteriler görür)</span>
            <input style={s.input} type="email" value={form.email} onChange={set("email")} maxLength={254} placeholder="bilgi@alanadiniz.com" />
          </label>
          <label style={s.field}>
            <span style={s.label}>Bildirim e-postası <em style={s.optional}>(boşsa yukarıdaki)</em></span>
            <input style={s.input} type="email" value={form.notificationEmail} onChange={set("notificationEmail")} maxLength={254} />
          </label>
          <label style={{ ...s.field, gridColumn: "1 / -1" }}>
            <span style={s.label}>Instagram adresi</span>
            <input style={s.input} value={form.instagramUrl} onChange={set("instagramUrl")} maxLength={300} />
          </label>
        </div>
        <p style={s.hint}>
          Yeni sipariş, ödeme uyarısı ve İletişim formu mesajları bildirim e-postasına gider. Müşteri e-postalarında
          “yanıtla” bu adrese yazar.
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
  banner: { margin: 0, padding: "0.625rem 0.875rem", borderRadius: 8, fontSize: "0.8125rem", lineHeight: 1.5 },
  bannerWarn: { background: "rgba(232,192,122,0.1)", border: "1px solid rgba(232,192,122,0.35)", color: "#e8c07a" },
  bannerOk: { background: "rgba(159,211,159,0.08)", border: "1px solid rgba(159,211,159,0.3)", color: "#9fd39f" },
  box: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    margin: 0,
    padding: "0.875rem 1rem 1rem",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
  },
  legend: { padding: "0 0.375rem", fontSize: "0.875rem", fontWeight: 600, color: "#e8e4d9" },
  radioRow: { display: "flex", flexWrap: "wrap", gap: "1.25rem" },
  check: { display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.8125rem", color: "#e8e4d9" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" },
  field: { display: "flex", flexDirection: "column", gap: "0.375rem", minWidth: 0 },
  label: { fontSize: "0.8125rem", color: "rgba(232,228,217,0.7)" },
  optional: { fontStyle: "normal", color: "rgba(232,228,217,0.4)" },
  hint: { fontSize: "0.75rem", color: "rgba(232,228,217,0.45)", margin: 0, lineHeight: 1.5 },
  input: {
    padding: "0.5rem 0.625rem",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    color: "#e8e4d9",
    fontSize: "0.875rem",
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
