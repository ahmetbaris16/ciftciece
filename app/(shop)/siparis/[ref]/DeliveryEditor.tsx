"use client";

/**
 * Sipariş sayfası — Teslimat kartı: teslimat bilgisi ve (kargoya verilene kadar) "Teslimat bilgilerini değiştir".
 *
 * Değiştirme izni sunucuda belirlenir (lib/orders/access.ts): siparişi veren tarayıcı ya da üye siparişinin sahibi
 * formu açar; başka cihazda sipariş e-postasına 24 saatlik bağlantı istenir (bağlantı açılınca form kendiliğinden
 * açılır). Form ödeme adımındaki kurallarla doğrulanır (lib/validation/checkout.ts); kayıt sonrası sayfa yenilenir,
 * müşteriye ve işletmeye e-posta gider. Yan sütun dar ve yapışkan olduğu için form pencerede (<dialog>) açılır.
 */

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PROVINCES_SORTED } from "@/lib/geo/provinces";
import {
  DeliveryChangeSchema,
  displayTrPhone,
  formatTrPhoneInput,
  toFieldErrors,
  type CheckoutField,
} from "@/lib/validation/checkout";
import styles from "./order.module.css";
import d from "./DeliveryEditor.module.css";

export interface DeliveryValues {
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  postalCode: string;
}

interface Props {
  reference: string;
  /** Kartta gösterilen tek satırlık teslimat metni */
  summary: string;
  initial: DeliveryValues;
  /** Sipariş durumu değişikliğe izin veriyor mu (kargoya verilmedi, kapanmadı) */
  editable: boolean;
  /** Kargoya verildi (bilgi notu) */
  shipped: boolean;
  /** Bu tarayıcı/hesap değiştirebilir mi; değilse e-postayla bağlantı istenir */
  access: boolean;
  /** Bağlantının gideceği adres (maskeli); e-posta yoksa null */
  maskedEmail: string | null;
  /** E-postadaki bağlantıyla gelindi: form açılsın */
  openOnLoad: boolean;
  /** Bağlantının süresi dolmuş ya da bozuk */
  linkInvalid: boolean;
}

type Errors = Partial<Record<CheckoutField, string>>;

export default function DeliveryEditor(props: Props) {
  const { reference, summary, initial, editable, shipped, access, maskedEmail, openOnLoad, linkInvalid } = props;
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [values, setValues] = useState<DeliveryValues>(() => ({ ...initial, phone: displayTrPhone(initial.phone) }));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(
    linkInvalid ? { kind: "error", text: "Bağlantının süresi dolmuş ya da bağlantı geçersiz. Aşağıdan yeni bağlantı isteyebilirsiniz." } : null
  );
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);

  const open = () => {
    setValues({ ...initial, phone: displayTrPhone(initial.phone) });
    setErrors({});
    setFormError(null);
    dialogRef.current?.showModal();
  };

  // E-postadaki bağlantıyla gelindi: form açılır; adres çubuğundaki ?adres=… temizlenir (yenileyince yeniden açılmasın)
  useEffect(() => {
    if (openOnLoad || linkInvalid) {
      const url = new URL(window.location.href);
      url.searchParams.delete("adres");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    if (openOnLoad && editable && access) dialogRef.current?.showModal();
  }, [openOnLoad, linkInvalid, editable, access]);

  const set = (field: keyof DeliveryValues, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => (e[field as CheckoutField] ? { ...e, [field]: undefined } : e));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = DeliveryChangeSchema.safeParse({ ...values, postalCode: values.postalCode || undefined });
    if (!parsed.success) {
      const { fieldErrors, message } = toFieldErrors(parsed.error);
      setErrors(fieldErrors);
      setFormError(message);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(reference)}/address`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, postalCode: values.postalCode || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErrors(data?.fieldErrors ?? {});
        setFormError(data?.error ?? "Kaydedilemedi. Lütfen tekrar deneyin.");
        if (res.status === 409) router.refresh(); // bu arada kargoya verildi
        return;
      }
      dialogRef.current?.close();
      setStatus({
        kind: "ok",
        text: data?.changed
          ? "Teslimat bilgileriniz güncellendi. Siparişiniz yeni adrese gönderilecek; e-postanıza da bilgi gönderdik."
          : "Bilgiler zaten aynıydı; değişiklik yapılmadı.",
      });
      router.refresh();
    } catch {
      setFormError("Bağlantı sorunu oluştu. Tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };

  const requestLink = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(reference)}/address-link`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus({ kind: "error", text: data?.error ?? "Bağlantı gönderilemedi." });
        return;
      }
      setLinkSentTo(data?.sentTo ?? maskedEmail ?? "e-posta adresinize");
    } catch {
      setStatus({ kind: "error", text: "Bağlantı sorunu oluştu. Tekrar deneyin." });
    } finally {
      setBusy(false);
    }
  };

  const field = (
    name: keyof DeliveryValues & CheckoutField,
    label: string,
    control: (p: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => React.ReactNode,
    opts: { full?: boolean; hint?: string; optional?: boolean } = {}
  ) => {
    const id = `${titleId}-${name}`;
    const err = errors[name];
    const describedBy = [err ? `${id}-err` : "", opts.hint ? `${id}-hint` : ""].filter(Boolean).join(" ") || undefined;
    return (
      <div className={`${d.field} ${opts.full ? d.full : ""}`}>
        <label className={d.label} htmlFor={id}>
          {label}
          {opts.optional && <span className={d.optional}> (isteğe bağlı)</span>}
        </label>
        {control({ id, ...(err ? { "aria-invalid": true as const } : {}), "aria-describedby": describedBy })}
        {opts.hint && !err && (
          <span id={`${id}-hint`} className={d.hint}>
            {opts.hint}
          </span>
        )}
        {err && (
          <span id={`${id}-err`} className={d.error}>
            {err}
          </span>
        )}
      </div>
    );
  };

  // Listede olmayan eski bir il yazımı kaybolmasın
  const provinces: readonly string[] = PROVINCES_SORTED;
  const cities = provinces.includes(values.city) || !values.city ? provinces : [values.city, ...provinces];

  return (
    <>
      <p className={styles.sideText} data-testid="delivery-summary">
        {summary}
      </p>

      {editable && (
        <div className={d.changeRow}>
          <button
            type="button"
            className={`${styles.secondaryBtn} ${d.changeBtn}`}
            onClick={access ? open : () => dialogRef.current?.showModal()}
            data-testid="delivery-change"
          >
            Teslimat bilgilerini değiştir
          </button>
          <p className={d.changeNote}>Siparişiniz kargoya verilene kadar adres, alıcı ve telefonu değiştirebilirsiniz.</p>
        </div>
      )}
      {shipped && (
        <p className={d.changeNote}>Siparişiniz kargoya verildi; adres değişikliği için kargo firmasıyla ya da bizimle iletişime geçin.</p>
      )}

      {status && (
        <p className={status.kind === "ok" ? styles.okText : styles.errorText} role={status.kind === "error" ? "alert" : "status"} data-testid="delivery-status">
          {status.text}
        </p>
      )}

      <dialog
        ref={dialogRef}
        className={d.dialog}
        aria-labelledby={titleId}
        onClick={(e) => {
          // Pencerenin dışına (arka plana) tıklanınca kapanır
          if (e.target === dialogRef.current && !busy) dialogRef.current?.close();
        }}
        data-testid="delivery-dialog"
      >
        <div className={d.panel}>
          <div className={d.head}>
            <h2 id={titleId} className={d.title}>
              Teslimat bilgileri
            </h2>
            <button type="button" className={d.close} onClick={() => dialogRef.current?.close()} aria-label="Kapat" disabled={busy}>
              <CloseIcon />
            </button>
          </div>

          {access ? (
            <form className={d.form} onSubmit={save} noValidate>
              <p className={d.lead}>Siparişiniz kargoya verilene kadar değiştirebilirsiniz. Kaydedince e-postanıza da bilgi gönderilir.</p>
              <div className={d.grid}>
                {field("firstName", "Alıcının adı", (p) => (
                  <input {...p} className={d.input} autoComplete="given-name" value={values.firstName} onChange={(e) => set("firstName", e.target.value)} />
                ))}
                {field("lastName", "Soyadı", (p) => (
                  <input {...p} className={d.input} autoComplete="family-name" value={values.lastName} onChange={(e) => set("lastName", e.target.value)} />
                ))}
                {field(
                  "phone",
                  "Cep telefonu",
                  (p) => (
                    <input
                      {...p}
                      className={d.input}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="05XX XXX XX XX"
                      maxLength={14}
                      value={values.phone}
                      onChange={(e) => set("phone", formatTrPhoneInput(e.target.value))}
                    />
                  ),
                  { full: true, hint: "Kargo görevlisi teslimat için bu numarayı arar." }
                )}
                {field(
                  "address",
                  "Açık adres",
                  (p) => (
                    <textarea
                      {...p}
                      className={`${d.input} ${d.textarea}`}
                      rows={3}
                      autoComplete="street-address"
                      placeholder="Mahalle, cadde/sokak, bina ve daire no"
                      value={values.address}
                      onChange={(e) => set("address", e.target.value)}
                    />
                  ),
                  { full: true }
                )}
                {field("city", "İl", (p) => (
                  <select {...p} className={d.input} autoComplete="address-level1" value={values.city} onChange={(e) => set("city", e.target.value)}>
                    <option value="">İl seçin</option>
                    {cities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                ))}
                {field("district", "İlçe", (p) => (
                  <input {...p} className={d.input} autoComplete="address-level2" value={values.district} onChange={(e) => set("district", e.target.value)} />
                ))}
                {field(
                  "postalCode",
                  "Posta kodu",
                  (p) => (
                    <input
                      {...p}
                      className={d.input}
                      inputMode="numeric"
                      autoComplete="postal-code"
                      maxLength={5}
                      value={values.postalCode}
                      onChange={(e) => set("postalCode", e.target.value.replace(/\D/g, "").slice(0, 5))}
                    />
                  ),
                  { optional: true }
                )}
              </div>
              {formError && (
                <p className={styles.errorText} role="alert" data-testid="delivery-error">
                  {formError}
                </p>
              )}
              <div className={d.actions}>
                <button type="button" className={styles.textBtn} onClick={() => dialogRef.current?.close()} disabled={busy}>
                  Vazgeç
                </button>
                <button type="submit" className={styles.primaryBtn} disabled={busy} data-testid="delivery-save">
                  {busy ? "Kaydediliyor…" : "Kaydet"}
                </button>
              </div>
            </form>
          ) : (
            <div className={d.form}>
              <p className={d.lead}>
                Güvenliğiniz için teslimat bilgileri siparişi verdiğiniz cihazdan ya da e-postanıza gönderdiğimiz bağlantıyla
                değiştirilir. Böylece sipariş numaranızı bilen başka biri paketinizi başka adrese yönlendiremez.
              </p>
              {linkSentTo ? (
                <p className={styles.okText} role="status" data-testid="delivery-link-sent">
                  Bağlantıyı {linkSentTo} adresine gönderdik. E-postadaki “Teslimat bilgilerini değiştir” düğmesine basın;
                  bağlantı 24 saat geçerlidir.
                </p>
              ) : maskedEmail ? (
                <div className={d.actions}>
                  <button type="button" className={styles.primaryBtn} onClick={requestLink} disabled={busy} data-testid="delivery-link">
                    {busy ? "Gönderiliyor…" : `Bağlantıyı ${maskedEmail} adresine gönder`}
                  </button>
                </div>
              ) : (
                <p className={styles.muted}>Siparişte e-posta adresi yok; değişiklik için bizi arayın.</p>
              )}
              {status?.kind === "error" && (
                <p className={styles.errorText} role="alert">
                  {status.text}
                </p>
              )}
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
