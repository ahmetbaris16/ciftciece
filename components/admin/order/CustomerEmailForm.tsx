"use client";

/**
 * Siparişten müşteriye e-posta: işletmenin adresinden, markalı şablonla ve "Siparişi görüntüle" bağlantısıyla
 * gider; müşteri yanıtlarsa yanıt işletmenin e-posta adresine düşer (Reply-To). Hazır metinler yalnız başlangıçtır,
 * göndermeden önce düzenlenir. Her form açılışında yeni bir anahtar üretilir: çift tıklama iki e-posta
 * göndermez.
 */

import { useState } from "react";
import { useAdminRequest } from "./useAdminRequest";
import f from "./forms.module.css";

const TEMPLATES: Array<{ id: string; label: string; subject: string; message: string }> = [
  { id: "bos", label: "Boş", subject: "", message: "" },
  {
    id: "urun",
    label: "Ürün bilgisi",
    subject: "Siparişinizdeki ürünler hakkında",
    message:
      "Siparişinizdeki ürünler hakkında bilgi vermek istedik:\n\n\n\nSorunuz olursa bu e-postayı yanıtlamanız yeterli.",
  },
  {
    id: "gecikme",
    label: "Hazırlık gecikmesi",
    subject: "Siparişinizin durumu",
    message:
      "Siparişinizin hazırlanması planladığımızdan biraz uzun sürüyor. Tahmini kargoya veriliş tarihi: \n\nAnlayışınız için teşekkür ederiz. Beklemek istemezseniz bu e-postayı yanıtlayın; siparişinizi iptal edip ödemenizi iade ederiz.",
  },
  {
    id: "stok",
    label: "Stok sorunu",
    subject: "Siparişinizdeki bir ürün hakkında",
    message:
      "Siparişinizdeki şu ürün stokta kalmadı: \n\nDilerseniz yerine başka bir ürün gönderebilir ya da bu ürünün tutarını iade edebiliriz. Tercihinizi bu e-postayı yanıtlayarak bize bildirin.",
  },
  {
    id: "adres",
    label: "Adres teyidi",
    subject: "Teslimat adresinizi teyit eder misiniz?",
    message:
      "Siparişinizi kargoya vermeden önce teslimat adresinizi teyit etmek istedik. Adresinizde eksik ya da hatalı bir bilgi varsa bu e-postayı yanıtlayarak doğru adresi yazar mısınız?",
  },
];

const newNonce = () => crypto.randomUUID();

export default function CustomerEmailForm({ orderId, to }: { orderId: string; to: string | null }) {
  const { busy, error, done, send, setError } = useAdminRequest();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [nonce, setNonce] = useState(newNonce);

  if (!to) return <p className={f.hint}>Bu siparişte müşteri e-posta adresi yok.</p>;

  const applyTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    if ((subject || message) && !window.confirm("Yazdığınız metnin yerine hazır metin konsun mu?")) return;
    setSubject(t.subject);
    setMessage(t.message);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (subject.trim().length < 3 || message.trim().length < 10) {
      setError("Konu ve mesajı yazın.");
      return;
    }
    if (!window.confirm(`E-posta ${to} adresine gönderilsin mi?`)) return;
    const ok = await send(
      `/api/admin/orders/${orderId}/email`,
      { subject: subject.trim(), message: message.trim(), nonce },
      { success: "E-posta kuyruğa alındı; birkaç saniye içinde gider." }
    );
    if (ok) {
      setSubject("");
      setMessage("");
      setNonce(newNonce());
    }
  };

  return (
    <form className={f.form} onSubmit={submit} noValidate>
      <div className={f.row}>
        <label className={f.field}>
          <span className={f.label}>Alıcı</span>
          <input className={f.input} value={to} readOnly />
        </label>
        <label className={f.field}>
          <span className={f.label}>Hazır metin</span>
          <select className={f.select} defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
            <option value="" disabled>
              Seçin (isteğe bağlı)
            </option>
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={f.field}>
        <span className={f.label}>Konu</span>
        <input className={f.input} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} />
      </label>
      <label className={f.field}>
        <span className={f.label}>Mesaj</span>
        <textarea className={f.textarea} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={5000} rows={7} />
      </label>
      <p className={f.hint}>
        E-posta “Merhaba {"{ad}"},” selamıyla başlar; altına sipariş bağlantısı ve işletme bilgileri eklenir. Müşteri yanıtlarsa
        yanıt, Ayarlar › İşletme&apos;deki e-posta adresine gelir.
      </p>
      <div className={f.actions}>
        <button type="submit" className={f.primary} disabled={busy}>
          {busy ? "Gönderiliyor…" : "E-postayı gönder"}
        </button>
        {error && <p className={f.error}>{error}</p>}
        {done && <p className={f.ok}>{done}</p>}
      </div>
    </form>
  );
}
