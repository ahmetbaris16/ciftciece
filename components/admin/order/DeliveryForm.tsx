"use client";

/**
 * Panel — teslimat bilgisini düzenle (ör. müşteri telefonla yanlış adres bildirdi). Kural müşteriyle aynı: sipariş
 * kargoya verilene kadar (lib/orders/lifecycle.ts changeShippingAddress). Kayıtta müşteriye "teslimat bilgileriniz
 * güncellendi" e-postası gider; eski adres sipariş geçmişinde kalır.
 */

import { useEffect, useState } from "react";
import { PROVINCES_SORTED } from "@/lib/geo/provinces";
import { DeliveryChangeSchema, displayTrPhone, formatTrPhoneInput, toFieldErrors } from "@/lib/validation/checkout";
import { useAdminRequest } from "./useAdminRequest";
import f from "./forms.module.css";

export interface AdminDeliveryValues {
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  postalCode: string;
}

/**
 * Kayıttan sonra sayfa yenilenir ve form güncel adresle yeniden kurulur (sayfada key = son değişiklik zamanı; eski
 * adres formda kalıp müşterinin yeni adresinin üstüne yazılmasın). Başarı mesajı yeniden kurulumda kaybolmasın diye
 * burada tutulur.
 */
const savedNotice = new Map<string, string>();

export default function DeliveryForm({ orderId, initial }: { orderId: string; initial: AdminDeliveryValues }) {
  const { busy, error, done, send, setError } = useAdminRequest();
  const [notice] = useState(() => savedNotice.get(orderId) ?? null);
  useEffect(() => {
    savedNotice.delete(orderId);
  }, [orderId]);
  const [v, setV] = useState<AdminDeliveryValues>(() => ({ ...initial, phone: displayTrPhone(initial.phone) }));
  const set = (k: keyof AdminDeliveryValues, value: string) => setV((s) => ({ ...s, [k]: value }));
  // Listede olmayan eski bir il yazımı kaybolmasın
  const provinces: readonly string[] = PROVINCES_SORTED;
  const cities = provinces.includes(v.city) || !v.city ? provinces : [v.city, ...provinces];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { ...v, postalCode: v.postalCode || undefined };
    const parsed = DeliveryChangeSchema.safeParse(body);
    if (!parsed.success) {
      setError(toFieldErrors(parsed.error).message);
      return;
    }
    await send(`/api/admin/orders/${orderId}/address`, body, {
      success: (r) => {
        const changed = (r as { changed?: boolean } | null)?.changed;
        const msg = changed
          ? "Teslimat bilgisi kaydedildi; müşteriye bilgi e-postası gidiyor. Paket fişini yazdırdıysanız yeniden yazdırın."
          : "Bilgiler aynıydı; değişiklik yapılmadı.";
        if (changed) savedNotice.set(orderId, msg);
        return msg;
      },
    });
  };

  return (
    <form className={f.form} onSubmit={submit} noValidate>
      <div className={f.row}>
        <label className={f.field}>
          <span className={f.label}>Alıcının adı</span>
          <input className={f.input} value={v.firstName} onChange={(e) => set("firstName", e.target.value)} autoComplete="off" />
        </label>
        <label className={f.field}>
          <span className={f.label}>Soyadı</span>
          <input className={f.input} value={v.lastName} onChange={(e) => set("lastName", e.target.value)} autoComplete="off" />
        </label>
      </div>
      <label className={f.field}>
        <span className={f.label}>Cep telefonu</span>
        <input
          className={f.input}
          type="tel"
          inputMode="tel"
          maxLength={14}
          placeholder="05XX XXX XX XX"
          value={v.phone}
          onChange={(e) => set("phone", formatTrPhoneInput(e.target.value))}
          autoComplete="off"
        />
      </label>
      <label className={f.field}>
        <span className={f.label}>Açık adres</span>
        <textarea className={f.textarea} rows={3} value={v.address} onChange={(e) => set("address", e.target.value)} />
      </label>
      <div className={f.row}>
        <label className={f.field}>
          <span className={f.label}>İl</span>
          <select className={f.select} value={v.city} onChange={(e) => set("city", e.target.value)}>
            <option value="">İl seçin</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={f.field}>
          <span className={f.label}>İlçe</span>
          <input className={f.input} value={v.district} onChange={(e) => set("district", e.target.value)} autoComplete="off" />
        </label>
        <label className={f.field}>
          <span className={f.label}>Posta kodu (isteğe bağlı)</span>
          <input
            className={f.input}
            inputMode="numeric"
            maxLength={5}
            value={v.postalCode}
            onChange={(e) => set("postalCode", e.target.value.replace(/\D/g, "").slice(0, 5))}
            autoComplete="off"
          />
        </label>
      </div>
      <div className={f.actions}>
        <button type="submit" className={f.primary} disabled={busy} data-testid="admin-delivery-save">
          {busy ? "Kaydediliyor…" : "Teslimat bilgisini kaydet"}
        </button>
        {error && <p className={f.error}>{error}</p>}
        {!error && (done ?? notice) && <p className={f.ok}>{done ?? notice}</p>}
      </div>
      <p className={f.hint}>Kargoya verilene kadar değiştirilebilir. Eski adres sipariş geçmişinde kalır; müşteriye e-posta gider.</p>
    </form>
  );
}
