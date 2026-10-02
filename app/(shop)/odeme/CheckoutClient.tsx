"use client";

/**
 * Ödeme (checkout) — /odeme
 *
 * Adımlar: 1 İletişim → 2 Teslimat ve fatura → 3 Ödeme (yöntem, siparişe özel sözleşmeler, onay).
 * Kart: sipariş açılır → /api/payment/create → bankanın (Akbank) 3D Secure ortak ödeme sayfasına imzalı form
 * gönderilir; kart bilgisi sitemize gelmez. Havale ve kapıda ödeme: sipariş sayfasına geçilir.
 *
 * Güvenlik ve doğruluk:
 * - Tutar, kargo ve ödeme yöntemi sunucuda yeniden hesaplanır/doğrulanır; buradaki gösterimdir.
 * - Aynı bilgilerle tekrar gönderim aynı idempotency anahtarını taşır: ikinci sipariş açılmaz.
 * - Ön Bilgilendirme ve Mesafeli Satış sözleşmesi sepete özel hâliyle onaydan hemen önce gösterilir
 *   (Mesafeli Sözleşmeler Yönetmeliği md. 6); son adımda ödeme yükümlülüğü açıkça yazılır.
 */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCart } from "@/lib/cart/CartContext";
import { formatPrice } from "@/types";
import {
  BillingSchema,
  CHECKOUT_MESSAGES,
  ContactSchema,
  ShippingSchema,
  displayTrPhone,
  formatTrPhoneInput,
  validateStep,
  type CheckoutField,
} from "@/lib/validation/checkout";
import { useShippingSettings } from "@/lib/shipping/useShippingSettings";
import { useShippingQuote } from "@/lib/shipping/useShippingQuote";
import { remainingForFreeShipping } from "@/lib/shipping/settings";
import { RECIPIENT_PAYS_NOTE, SHIPPING_BASIS_NOTE } from "@/lib/shipping/quote";
import { usePaymentOptions } from "@/lib/payment/usePaymentOptions";
import { PAYMENT_METHOD_LABELS, isOptionAllowed, type PaymentMethodId, type PaymentOption } from "@/lib/payment/methods";
import { CHECKOUT_TERMS_VERSION, LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import { distanceSalesSections, preInformationSections, type OrderContext } from "@/lib/legal/content";
import { checkoutKeyFor, forgetCheckoutKey } from "@/lib/checkout/client-key";
import { PROVINCES_SORTED } from "@/lib/geo/provinces";
import { formatPhoneTr, type BusinessInfo } from "@/lib/business/info";
import LegalSections from "@/components/legal/LegalSections";
import PaymentMarks from "@/components/payment/PaymentMarks";
import styles from "./checkout.module.css";

type Step = "iletisim" | "teslimat" | "odeme";
const STEPS: Array<{ id: Step; label: string }> = [
  { id: "iletisim", label: "İletişim" },
  { id: "teslimat", label: "Teslimat ve fatura" },
  { id: "odeme", label: "Ödeme" },
];

interface ContactInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}
interface ShippingInfo {
  address: string;
  district: string;
  city: string;
  postalCode: string;
}
interface BillingState {
  type: "INDIVIDUAL" | "CORPORATE";
  companyName: string;
  taxOffice: string;
  taxNumber: string;
  sameAsShipping: boolean;
  billingAddress: string;
  billingDistrict: string;
  billingCity: string;
}

const CONTACT_FIELDS: CheckoutField[] = ["firstName", "lastName", "email", "phone"];
const PAYMENT_FIELDS: CheckoutField[] = ["paymentMethod", "acceptTerms"];

const PAYMENT_RETURN_ERRORS: Record<string, string> = {
  payment_failed: "Ödeme tamamlanmadı: banka işlemi onaylamadı. Kart bilgilerinizi kontrol edip tekrar deneyebilir ya da başka bir ödeme yöntemi seçebilirsiniz.",
  payment_not_found: "Ödeme kaydı bulunamadı. Lütfen tekrar sipariş verin.",
  payment_error: "Ödeme sırasında bir hata oluştu. Lütfen tekrar deneyin.",
  // Sonuç doğrulanamadı: para çekilmiş olabilir, müşteri hemen tekrar ödemesin
  payment_unverified:
    "Ödemenizin sonucunu şu anda doğrulayamadık. Kartınızdan çekim yapıldıysa siparişiniz birkaç dakika içinde onaylanır; tekrar ödemeden önce Sipariş Takibi sayfasından kontrol edin ya da bizi arayın.",
};

export default function CheckoutClient({ business, cardProvider }: { business: BusinessInfo; cardProvider: string }) {
  const { cart, isHydrated } = useCart();
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const returnError = errorParam ? (PAYMENT_RETURN_ERRORS[errorParam] ?? "Bir hata oluştu. Lütfen tekrar deneyin.") : null;

  const [step, setStep] = useState<Step>(() => (errorParam ? "odeme" : "iletisim"));
  const [contact, setContact] = useState<ContactInfo>({ firstName: "", lastName: "", email: "", phone: "" });
  const [shipping, setShipping] = useState<ShippingInfo>({ address: "", district: "", city: "", postalCode: "" });
  const [billing, setBilling] = useState<BillingState>({
    type: "INDIVIDUAL",
    companyName: "",
    taxOffice: "",
    taxNumber: "",
    sameAsShipping: true,
    billingAddress: "",
    billingDistrict: "",
    billingCity: "",
  });
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [chosenMethod, setChosenMethod] = useState<PaymentMethodId | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<CheckoutField, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(returnError);
  const [summaryOpen, setSummaryOpen] = useState(false);
  // Sipariş açıldı ama ödeme başlatılamadıysa aynı siparişle tekrar denenir (ikinci sipariş/stok düşümü olmaz)
  const [pendingOrder, setPendingOrder] = useState<{ id: string; reference: string; key: string } | null>(null);
  const formTopRef = useRef<HTMLDivElement>(null);

  const shippingState = useShippingSettings();
  const quoteState = useShippingQuote(cart.items);
  const paymentOptionsState = usePaymentOptions();

  // Üye girişliyse iletişim bilgileri hesaptan gelir (yalnız boş alanlar; müşteri değiştirebilir)
  const { data: session, status: sessionStatus } = useSession();
  const isCustomer = sessionStatus === "authenticated" && (session?.user as { role?: string } | undefined)?.role === "CUSTOMER";
  const prefilled = useRef(false);
  useEffect(() => {
    if (!isCustomer || prefilled.current) return;
    prefilled.current = true;
    fetch("/api/account/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user?: { firstName: string; lastName: string; email: string; phone: string | null } } | null) => {
        const u = d?.user;
        if (!u) return;
        setContact((c) => ({
          firstName: c.firstName || u.firstName,
          lastName: c.lastName || u.lastName,
          email: c.email || u.email,
          phone: c.phone || (u.phone ? displayTrPhone(u.phone) : ""),
        }));
      })
      .catch((err) => console.error("[checkout] Üye bilgileri alınamadı:", err));
  }, [isCustomer]);

  // Adım değişince formun başına dön (mobilde özellikle); ilk açılışta kaydırılmaz
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  // ── Hesaplanan değerler (gösterim; sunucu yeniden hesaplar) ──
  const shippingSettings = shippingState.status === "ready" ? shippingState.settings : null;
  const quote = quoteState.status === "ready" ? quoteState.quote : null;
  const carrierName = quote?.carrierName ?? shippingSettings?.carrierName ?? "Yurtiçi Kargo";
  const freeShipping = quote?.status === "free";
  const recipientPays = quote?.status === "recipient";
  const shippingKnown = quote?.status === "free" || quote?.status === "priced" || recipientPays;
  const shippingUnknown = quote?.status === "unknown" || quoteState.status === "error";
  const shippingKurus = quote && quote.status !== "unknown" ? quote.feeKurus : 0;
  const options: PaymentOption[] = paymentOptionsState.status === "ready" ? paymentOptionsState.options : [];
  const selectable = options.filter((o) => isOptionAllowed(o, cart.subtotalKurus + shippingKurus));
  const comingSoon = options.filter((o) => !o.available);
  const selected = selectable.find((o) => o.id === chosenMethod) ?? selectable[0] ?? null;
  const feeKurus = selected?.feeKurus ?? 0;
  const noPaymentMethod = paymentOptionsState.status !== "loading" && selectable.length === 0;
  const totalKurus = cart.subtotalKurus + shippingKurus + feeKurus;
  const remainingFree = shippingSettings ? remainingForFreeShipping(cart.subtotalKurus, shippingSettings) : 0;
  const shippingLabel =
    quoteState.status === "loading"
      ? "Hesaplanıyor…"
      : !quote || quote.status === "unknown"
        ? "Hesaplanamadı"
        : quote.status === "free"
          ? "Ücretsiz"
          : quote.status === "recipient"
            ? "Teslimatta ödenir"
            : formatPrice(quote.feeKurus);
  const totalLabel = shippingKnown ? formatPrice(totalKurus) : `${formatPrice(cart.subtotalKurus)} + kargo`;
  const fullName = `${contact.firstName} ${contact.lastName}`.trim();

  // Sözleşmelerin sepete özel hâli (onaydan hemen önce gösterilir)
  const legalContext: OrderContext | null = !selected
    ? null
    : {
      buyer: { name: fullName, email: contact.email, phone: contact.phone },
      deliveryAddress: [fullName, shipping.address, `${shipping.district} / ${shipping.city}${shipping.postalCode ? ` ${shipping.postalCode}` : ""}`]
        .filter(Boolean)
        .join(", "),
      billing:
        billing.type === "CORPORATE"
          ? `Kurumsal: ${billing.companyName}, VD: ${billing.taxOffice}, VKN/TCKN: ${billing.taxNumber}`
          : `Bireysel: ${fullName}`,
      items: cart.items.map((i) => ({
        name: i.productName,
        variant: i.variantName,
        quantity: i.quantity,
        unitPriceKurus: i.priceKurus,
        lineTotalKurus: i.priceKurus * i.quantity,
      })),
      subtotalKurus: cart.subtotalKurus,
      shippingKurus: recipientPays ? null : shippingKurus,
      paymentFeeKurus: feeKurus,
      discountKurus: 0,
      totalKurus,
      paymentMethodLabel: PAYMENT_METHOD_LABELS[selected.id],
      carrierName,
    };

  const clearError = (field: CheckoutField) =>
    setErrors((e) => {
      if (!e[field]) return e;
      const next = { ...e };
      delete next[field];
      return next;
    });

  const billingPayload = () =>
    billing.type === "INDIVIDUAL" && billing.sameAsShipping
      ? { type: "INDIVIDUAL" as const, sameAsShipping: true }
      : {
          type: billing.type,
          sameAsShipping: billing.sameAsShipping,
          ...(billing.type === "CORPORATE"
            ? { companyName: billing.companyName.trim(), taxOffice: billing.taxOffice.trim(), taxNumber: billing.taxNumber.replace(/\s/g, "") }
            : {}),
          ...(!billing.sameAsShipping
            ? { billingAddress: billing.billingAddress.trim(), billingDistrict: billing.billingDistrict.trim(), billingCity: billing.billingCity.trim() }
            : {}),
        };

  // ── Sipariş gönderimi ──
  const placeOrder = async () => {
    setSubmitError(null);
    if (!selected) return setSubmitError(CHECKOUT_MESSAGES.paymentMethod);
    if (!acceptTerms) {
      setErrors((e) => ({ ...e, acceptTerms: CHECKOUT_MESSAGES.acceptTerms }));
      document.getElementById("accept-terms")?.focus();
      return;
    }
    setSubmitting(true);
    const items = cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
    const billingBody = billingPayload();
    const trimmedNote = note.trim();
    const orderKey = JSON.stringify({ items, contact, shipping, paymentMethod: selected.id, billing: billingBody, note: trimmedNote });
    // Aynı bilgilerle tekrar gönderim aynı anahtarı taşır: sunucu yeni sipariş açmaz
    const idempotencyKey = checkoutKeyFor(orderKey);
    const fail = (message: string) => {
      setSubmitError(message);
      setSubmitting(false);
    };

    try {
      let order = pendingOrder && pendingOrder.key === orderKey ? pendingOrder : null;
      if (!order) {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items,
            contact,
            shipping: { ...shipping, postalCode: shipping.postalCode || undefined },
            billing: billingBody,
            ...(trimmedNote ? { note: trimmedNote } : {}),
            paymentMethod: selected.id,
            acceptTerms: true,
            termsVersion: CHECKOUT_TERMS_VERSION,
            idempotencyKey,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          if (data?.code === "IDEMPOTENCY_CONFLICT" || data?.code === "ORDER_CLOSED") {
            forgetCheckoutKey();
            setPendingOrder(null);
          }
          const fieldErrors = (data?.fieldErrors ?? {}) as Partial<Record<CheckoutField, string>>;
          const keys = Object.keys(fieldErrors) as CheckoutField[];
          if (keys.length > 0) {
            setErrors(fieldErrors);
            setStep(
              keys.some((k) => CONTACT_FIELDS.includes(k)) ? "iletisim" : keys.every((k) => PAYMENT_FIELDS.includes(k)) ? "odeme" : "teslimat"
            );
          }
          return fail(typeof data?.error === "string" ? data.error : CHECKOUT_MESSAGES.orderFailed);
        }
        order = { id: data.orderId as string, reference: data.order?.reference ?? "", key: orderKey };
        if (data.nextStep === "order") {
          router.push(`/siparis/${order.reference}`);
          return;
        }
        setPendingOrder(order);
      }

      const payRes = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const pay = await payRes.json().catch(() => null);
      if (!payRes.ok) {
        const code = pay?.code;
        if ((code === "ALREADY_PAID" || code === "REVIEW") && typeof pay?.reference === "string") {
          router.push(`/siparis/${pay.reference}`);
          return;
        }
        if (code === "NOT_PENDING" || code === "EXPIRED") {
          setPendingOrder(null);
          forgetCheckoutKey();
        }
        return fail(typeof pay?.error === "string" ? pay.error : CHECKOUT_MESSAGES.paymentFailed);
      }
      // Sepet burada temizlenmez: ödeme onaylanınca sipariş sayfası temizler (başarısız dönüşte sepet durur)
      setPendingOrder(null);
      if (pay?.form?.action && pay.form.fields) {
        setRedirecting(true);
        submitPaymentForm(pay.form as { action: string; fields: Record<string, string> });
      } else if (pay?.redirectUrl) {
        setRedirecting(true);
        window.location.assign(pay.redirectUrl);
      } else {
        router.push(`/siparis/${order.reference}`);
      }
    } catch (err) {
      console.error("[checkout] Beklenmeyen hata:", err);
      fail("Bağlantı sorunu oluştu. İnternetinizi kontrol edip tekrar deneyin.");
    }
  };

  // ── Boş / yükleniyor ──
  if (!isHydrated) {
    return (
      <div className={styles.page}>
        <div className={styles.state}>Yükleniyor…</div>
      </div>
    );
  }
  if (cart.items.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.state}>
          <p role={returnError ? "alert" : undefined}>{returnError ?? "Sepetiniz boş. Ödemeye geçmek için sepetinize ürün ekleyin."}</p>
          <Link href="/urunler" className={styles.primaryBtn}>
            Ürünlere göz atın
          </Link>
        </div>
      </div>
    );
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const goShipping = () => {
    const e = validateStep(ContactSchema, contact);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep("teslimat");
  };
  const goPayment = () => {
    const e = {
      ...validateStep(ShippingSchema, shipping),
      ...validateStep(BillingSchema, billingPayload()),
      ...(note.trim().length > 500 ? { note: CHECKOUT_MESSAGES.note } : {}),
    };
    setErrors(e);
    if (Object.keys(e).length === 0 && shippingKnown) setStep("odeme");
  };

  const field = (
    id: CheckoutField,
    label: string,
    input: React.ReactNode,
    opts: { full?: boolean; hint?: string; optional?: boolean } = {}
  ) => (
    <div className={`${styles.field} ${opts.full ? styles.full : ""}`}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {opts.optional && <span className={styles.optional}> (isteğe bağlı)</span>}
      </label>
      {input}
      {errors[id] ? (
        <span id={`${id}-error`} className={styles.fieldError} role="alert">
          {errors[id]}
        </span>
      ) : opts.hint ? (
        <span className={styles.hint}>{opts.hint}</span>
      ) : null}
    </div>
  );
  const inputProps = (id: CheckoutField) => ({
    id,
    className: `${styles.input} ${errors[id] ? styles.invalid : ""}`,
    "aria-invalid": !!errors[id],
    "aria-describedby": errors[id] ? `${id}-error` : undefined,
  });

  return (
    <div className={styles.page}>
      {redirecting && (
        <div className={styles.overlay} role="status" aria-live="assertive">
          <div className={styles.overlayCard}>
            <LockIcon size={28} />
            <p className={styles.overlayTitle}>Bankanın güvenli ödeme sayfasına geçiyorsunuz</p>
            <p className={styles.overlayText}>Kart bilgilerinizi {cardProvider} güvenli ödeme sayfasında (3D Secure) gireceksiniz. Lütfen sayfayı kapatmayın.</p>
          </div>
        </div>
      )}

      <div className={styles.container}>
        <div className={styles.topRow}>
          <p className={styles.secureLine}>
            <LockIcon size={14} /> Güvenli ödeme
          </p>
          <Link href="/sepet" className={styles.backLink}>
            Sepete dön
          </Link>
        </div>

        {/* Mobil: sipariş özeti açılır çubuk */}
        <button type="button" className={styles.mobileSummaryBar} onClick={() => setSummaryOpen((v) => !v)} aria-expanded={summaryOpen}>
          <span>{summaryOpen ? "Sipariş özetini gizle" : "Sipariş özetini göster"}</span>
          <strong>{totalLabel}</strong>
        </button>

        <div className={styles.layout}>
          <div className={styles.main} ref={formTopRef}>
            <ol className={styles.steps} aria-label="Ödeme adımları">
              {STEPS.map((s, i) => {
                const done = i < stepIndex;
                const active = s.id === step;
                return (
                  <li key={s.id} className={`${styles.step} ${active ? styles.stepActive : ""} ${done ? styles.stepDone : ""}`}>
                    <button type="button" onClick={() => done && setStep(s.id)} disabled={!done} aria-current={active ? "step" : undefined}>
                      <span className={styles.stepNum}>{done ? <CheckIcon /> : i + 1}</span>
                      <span className={styles.stepLabel}>{s.label}</span>
                    </button>
                  </li>
                );
              })}
            </ol>

            {/* ── 1. İletişim ── */}
            {step === "iletisim" && (
              <section className={styles.panel} aria-labelledby="contact-title">
                <h2 id="contact-title" className={styles.panelTitle}>
                  İletişim bilgileri
                </h2>
                <p className={styles.panelLead}>
                  {isCustomer ? (
                    <>
                      Üye olarak sipariş veriyorsunuz; siparişiniz <Link href="/hesabim">Hesabım</Link>&apos;da da görünecek.
                    </>
                  ) : sessionStatus !== "loading" ? (
                    <>
                      Sipariş onayı ve kargo bilgisi bu e-postaya gelir. Üyeyseniz{" "}
                      <Link href="/giris?next=/odeme">giriş yapın</Link>; üye olmadan da devam edebilirsiniz.
                    </>
                  ) : (
                    "Sipariş onayı ve kargo bilgisi bu e-postaya gelir."
                  )}
                </p>
                <div className={styles.grid}>
                  {field(
                    "firstName",
                    "Ad",
                    <input {...inputProps("firstName")} type="text" autoComplete="given-name" value={contact.firstName} onChange={(e) => { setContact((c) => ({ ...c, firstName: e.target.value })); clearError("firstName"); }} />
                  )}
                  {field(
                    "lastName",
                    "Soyad",
                    <input {...inputProps("lastName")} type="text" autoComplete="family-name" value={contact.lastName} onChange={(e) => { setContact((c) => ({ ...c, lastName: e.target.value })); clearError("lastName"); }} />
                  )}
                  {field(
                    "email",
                    "E-posta",
                    <input {...inputProps("email")} type="email" autoComplete="email" inputMode="email" value={contact.email} onChange={(e) => { setContact((c) => ({ ...c, email: e.target.value })); clearError("email"); }} />,
                    { full: true }
                  )}
                  {field(
                    "phone",
                    "Cep telefonu",
                    <input {...inputProps("phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="05XX XXX XX XX" maxLength={14} value={contact.phone} onChange={(e) => { setContact((c) => ({ ...c, phone: formatTrPhoneInput(e.target.value) })); clearError("phone"); }} />,
                    { full: true, hint: "Kargo firması teslimat için bu numarayı arar." }
                  )}
                </div>
                <div className={styles.actions}>
                  <button type="button" className={styles.primaryBtn} onClick={goShipping}>
                    Teslimat bilgilerine geç
                  </button>
                </div>
              </section>
            )}

            {/* ── 2. Teslimat ve fatura ── */}
            {step === "teslimat" && (
              <section className={styles.panel} aria-labelledby="ship-title">
                <h2 id="ship-title" className={styles.panelTitle}>
                  Teslimat adresi
                </h2>
                <div className={styles.grid}>
                  {field(
                    "address",
                    "Açık adres",
                    <textarea {...inputProps("address")} className={`${styles.input} ${styles.textarea} ${errors.address ? styles.invalid : ""}`} rows={3} autoComplete="street-address" placeholder="Mahalle, cadde/sokak, bina ve daire no" value={shipping.address} onChange={(e) => { setShipping((s) => ({ ...s, address: e.target.value })); clearError("address"); }} />,
                    { full: true }
                  )}
                  {field(
                    "city",
                    "İl",
                    <select {...inputProps("city")} autoComplete="address-level1" value={shipping.city} onChange={(e) => { setShipping((s) => ({ ...s, city: e.target.value })); clearError("city"); }}>
                      <option value="">İl seçin</option>
                      {PROVINCES_SORTED.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  )}
                  {field(
                    "district",
                    "İlçe",
                    <input {...inputProps("district")} type="text" autoComplete="address-level2" value={shipping.district} onChange={(e) => { setShipping((s) => ({ ...s, district: e.target.value })); clearError("district"); }} />
                  )}
                  {field(
                    "postalCode",
                    "Posta kodu",
                    <input {...inputProps("postalCode")} type="text" inputMode="numeric" autoComplete="postal-code" maxLength={5} placeholder="16800" value={shipping.postalCode} onChange={(e) => { setShipping((s) => ({ ...s, postalCode: e.target.value.replace(/\D/g, "").slice(0, 5) })); clearError("postalCode"); }} />,
                    { optional: true }
                  )}
                </div>

                <div className={styles.carrier}>
                  <TruckIcon />
                  <div>
                    <p className={styles.carrierName}>{carrierName}</p>
                    <p className={styles.muted}>{SHIPPING_BASIS_NOTE}</p>
                    {recipientPays && <p className={styles.recipientNote}>{RECIPIENT_PAYS_NOTE}</p>}
                  </div>
                  <span className={`${styles.carrierPrice} ${freeShipping ? styles.free : ""}`} aria-live="polite">
                    {shippingLabel}
                  </span>
                </div>
                {shippingUnknown && (
                  <p className={styles.alert} role="alert">
                    {CHECKOUT_MESSAGES.shippingUnknown}
                  </p>
                )}

                <h2 className={`${styles.panelTitle} ${styles.subTitle}`}>Fatura bilgileri</h2>
                <div className={styles.segmented} role="radiogroup" aria-label="Fatura türü">
                  {(["INDIVIDUAL", "CORPORATE"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={billing.type === t}
                      className={billing.type === t ? styles.segActive : ""}
                      onClick={() => setBilling((b) => ({ ...b, type: t }))}
                    >
                      {t === "INDIVIDUAL" ? "Bireysel" : "Kurumsal"}
                    </button>
                  ))}
                </div>
                {billing.type === "INDIVIDUAL" ? (
                  <p className={styles.muted}>Fatura {fullName || "teslimattaki ad-soyad"} adına düzenlenir.</p>
                ) : (
                  <div className={styles.grid}>
                    {field(
                      "companyName",
                      "Şirket unvanı",
                      <input {...inputProps("companyName")} type="text" autoComplete="organization" value={billing.companyName} onChange={(e) => { setBilling((b) => ({ ...b, companyName: e.target.value })); clearError("companyName"); }} />,
                      { full: true }
                    )}
                    {field(
                      "taxOffice",
                      "Vergi dairesi",
                      <input {...inputProps("taxOffice")} type="text" value={billing.taxOffice} onChange={(e) => { setBilling((b) => ({ ...b, taxOffice: e.target.value })); clearError("taxOffice"); }} />
                    )}
                    {field(
                      "taxNumber",
                      "Vergi numarası",
                      <input {...inputProps("taxNumber")} type="text" inputMode="numeric" maxLength={11} value={billing.taxNumber} onChange={(e) => { setBilling((b) => ({ ...b, taxNumber: e.target.value.replace(/\D/g, "").slice(0, 11) })); clearError("taxNumber"); }} />
                    )}
                  </div>
                )}
                <label className={styles.check}>
                  <input type="checkbox" checked={billing.sameAsShipping} onChange={(e) => setBilling((b) => ({ ...b, sameAsShipping: e.target.checked }))} />
                  <span>Fatura adresim teslimat adresiyle aynı</span>
                </label>
                {!billing.sameAsShipping && (
                  <div className={styles.grid}>
                    {field(
                      "billingAddress",
                      "Fatura adresi",
                      <textarea {...inputProps("billingAddress")} className={`${styles.input} ${styles.textarea} ${errors.billingAddress ? styles.invalid : ""}`} rows={2} value={billing.billingAddress} onChange={(e) => { setBilling((b) => ({ ...b, billingAddress: e.target.value })); clearError("billingAddress"); }} />,
                      { full: true }
                    )}
                    {field(
                      "billingCity",
                      "İl",
                      <select {...inputProps("billingCity")} value={billing.billingCity} onChange={(e) => { setBilling((b) => ({ ...b, billingCity: e.target.value })); clearError("billingCity"); }}>
                        <option value="">İl seçin</option>
                        {PROVINCES_SORTED.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    )}
                    {field(
                      "billingDistrict",
                      "İlçe",
                      <input {...inputProps("billingDistrict")} type="text" value={billing.billingDistrict} onChange={(e) => { setBilling((b) => ({ ...b, billingDistrict: e.target.value })); clearError("billingDistrict"); }} />
                    )}
                  </div>
                )}

                {showNote || note ? (
                  <div className={styles.grid}>
                    {field(
                      "note",
                      "Sipariş notu",
                      <textarea {...inputProps("note")} className={`${styles.input} ${styles.textarea}`} rows={2} maxLength={500} placeholder="Teslimatla ilgili iletmek istediğiniz bir not (ör. kapıcıya bırakılabilir)" value={note} onChange={(e) => { setNote(e.target.value); clearError("note"); }} />,
                      { full: true, optional: true }
                    )}
                  </div>
                ) : (
                  <button type="button" className={styles.textBtn} onClick={() => setShowNote(true)}>
                    Sipariş notu ekle
                  </button>
                )}

                <div className={styles.actions}>
                  <button type="button" className={styles.secondaryBtn} onClick={() => setStep("iletisim")}>
                    Geri
                  </button>
                  <button type="button" className={styles.primaryBtn} onClick={goPayment} disabled={!shippingKnown}>
                    Ödeme adımına geç
                  </button>
                </div>
              </section>
            )}

            {/* ── 3. Ödeme ── */}
            {step === "odeme" && (
              <section className={styles.panel} aria-labelledby="pay-title">
                <h2 id="pay-title" className={styles.panelTitle}>
                  Ödeme
                </h2>

                <dl className={styles.review}>
                  <div>
                    <dt>Teslimat</dt>
                    <dd>
                      {fullName}, {shipping.address}, {shipping.district} / {shipping.city}
                    </dd>
                    <button type="button" className={styles.textBtn} onClick={() => setStep("teslimat")}>
                      Değiştir
                    </button>
                  </div>
                  <div>
                    <dt>Fatura</dt>
                    <dd>{billing.type === "CORPORATE" ? `${billing.companyName} (VKN ${billing.taxNumber})` : `Bireysel — ${fullName}`}</dd>
                    <button type="button" className={styles.textBtn} onClick={() => setStep("teslimat")}>
                      Değiştir
                    </button>
                  </div>
                  <div>
                    <dt>İletişim</dt>
                    <dd>
                      {contact.email} · {contact.phone}
                    </dd>
                    <button type="button" className={styles.textBtn} onClick={() => setStep("iletisim")}>
                      Değiştir
                    </button>
                  </div>
                </dl>

                {submitError && (
                  <div className={styles.alert} role="alert">
                    {submitError}
                  </div>
                )}

                <fieldset className={styles.methods}>
                  <legend className={styles.legend}>Ödeme yöntemi</legend>
                  {paymentOptionsState.status === "loading" ? (
                    <p className={styles.muted}>Ödeme seçenekleri yükleniyor…</p>
                  ) : noPaymentMethod ? (
                    <p className={styles.alert} role="alert">
                      {paymentOptionsState.status === "error" ? "Ödeme seçenekleri yüklenemedi. Lütfen sayfayı yenileyin." : CHECKOUT_MESSAGES.noPaymentMethod}
                    </p>
                  ) : null}
                  {selectable.map((o) => {
                    const checked = selected?.id === o.id;
                    return (
                      <label key={o.id} className={`${styles.method} ${checked ? styles.methodOn : ""}`}>
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={o.id}
                          checked={checked}
                          onChange={() => {
                            setChosenMethod(o.id);
                            setSubmitError(null);
                          }}
                        />
                        <span className={styles.methodIcon} aria-hidden="true">
                          <MethodIcon id={o.id} />
                        </span>
                        <span className={styles.methodBody}>
                          <span className={styles.methodTitle}>
                            {o.title}
                            {o.feeKurus > 0 && <span className={styles.methodFee}>+{formatPrice(o.feeKurus)}</span>}
                            {o.testMode && <span className={styles.testPill}>TEST — gerçek para çekilmez</span>}
                            {o.demoMode && <span className={styles.testPill}>DEMO — gerçek ödeme alınmaz</span>}
                          </span>
                          <span className={styles.methodDesc}>{o.description}</span>
                          {o.id === "CARD" && <PaymentMarks compact />}
                        </span>
                      </label>
                    );
                  })}
                  {comingSoon.map((o) => (
                    <div key={o.id} className={`${styles.method} ${styles.methodDisabled}`} aria-disabled="true">
                      <span className={styles.methodIcon} aria-hidden="true">
                        <MethodIcon id={o.id} />
                      </span>
                      <span className={styles.methodBody}>
                        <span className={styles.methodTitle}>
                          {o.title}
                          <span className={styles.soonPill}>Yakında</span>
                        </span>
                        <span className={styles.methodDesc}>{o.description}</span>
                        <PaymentMarks compact showSecure={false} />
                      </span>
                    </div>
                  ))}
                </fieldset>

                {legalContext && (
                  <div className={styles.legal}>
                    <details className={styles.doc}>
                      <summary>{LEGAL_DOCUMENTS.PRE_INFORMATION_FORM.title} — siparişinize özel</summary>
                      <div className={styles.docBody}>
                        <LegalSections sections={preInformationSections(business, legalContext)} compact />
                      </div>
                    </details>
                    <details className={styles.doc}>
                      <summary>{LEGAL_DOCUMENTS.DISTANCE_SALES_CONTRACT.title} — siparişinize özel</summary>
                      <div className={styles.docBody}>
                        <LegalSections sections={distanceSalesSections(business, legalContext)} compact />
                      </div>
                    </details>
                    <label className={`${styles.check} ${errors.acceptTerms ? styles.checkInvalid : ""}`}>
                      <input
                        id="accept-terms"
                        type="checkbox"
                        checked={acceptTerms}
                        aria-invalid={!!errors.acceptTerms}
                        aria-describedby={errors.acceptTerms ? "terms-error" : undefined}
                        onChange={(e) => {
                          setAcceptTerms(e.target.checked);
                          clearError("acceptTerms");
                        }}
                      />
                      <span>
                        Ön Bilgilendirme Formu&apos;nu ve Mesafeli Satış Sözleşmesi&apos;ni okudum, onaylıyorum.
                      </span>
                    </label>
                    {errors.acceptTerms && (
                      <span id="terms-error" className={styles.fieldError} role="alert">
                        {errors.acceptTerms}
                      </span>
                    )}
                  </div>
                )}

                <p className={styles.obligation}>
                  {selected?.id === "CARD"
                    ? "“Siparişi onayla ve öde” düğmesine bastığınızda siparişiniz ödeme yükümlülüğü doğurur ve bankanın güvenli ödeme sayfasına geçersiniz; kart bilgilerinizi orada girip telefonunuza gelen kodla onaylarsınız."
                    : selected?.id === "BANK_TRANSFER"
                      ? "“Siparişi onayla” düğmesine bastığınızda siparişiniz ödeme yükümlülüğü doğurur; havale bilgileri bir sonraki sayfada ve e-postanızda gösterilir."
                      : "“Siparişi onayla” düğmesine bastığınızda siparişiniz ödeme yükümlülüğü doğurur; ödemeyi teslimatta yaparsınız."}
                </p>

                <div className={styles.actions}>
                  <button type="button" className={styles.secondaryBtn} onClick={() => setStep("teslimat")} disabled={submitting}>
                    Geri
                  </button>
                  <button type="button" id="place-order-btn" className={`${styles.primaryBtn} ${styles.payBtn}`} onClick={placeOrder} disabled={submitting || !shippingKnown || !selected}>
                    {submitting ? (
                      <>
                        <SpinnerIcon /> İşleniyor…
                      </>
                    ) : (
                      <>
                        <LockIcon size={16} />
                        {selected?.id === "CARD" ? "Siparişi onayla ve öde" : "Siparişi onayla"}
                        {shippingKnown && <span className={styles.payAmount}>{formatPrice(totalKurus)}</span>}
                      </>
                    )}
                  </button>
                </div>
                <p className={styles.trustLine}>
                  {selected?.id === "CARD" && selected.demoMode
                    ? "Demo: sanal POS bağlanana kadar bir sonraki sayfa bankanın ödeme sayfasının demo kopyasıdır; gerçek ödeme alınmaz, kart bilgileri hiçbir yere gönderilmez."
                    : selected?.id === "CARD"
                    ? `Kart bilgileriniz ${cardProvider} güvenli ödeme sayfasında (3D Secure) girilir; sitemize gelmez ve saklanmaz.`
                    : `Sorunuz mu var? ${formatPhoneTr(business.phone)} — ödeme ya da teslimatla ilgili her konuda yardımcı oluruz.`}
                </p>
              </section>
            )}
          </div>

          {/* ── Sipariş fişi ── */}
          <aside className={`${styles.receipt} ${summaryOpen ? styles.receiptOpen : ""}`} aria-label="Sipariş özeti">
            <div className={styles.receiptInner}>
              <p className={styles.receiptBrand}>{business.tradeName}</p>
              <p className={styles.receiptPlace}>Orhangazi, Bursa</p>
              <ul className={styles.lines}>
                {cart.items.map((item) => (
                  <li key={item.variantId} className={styles.line}>
                    <span className={styles.thumb}>
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.imageAlt || item.productName} width={56} height={56} sizes="56px" />
                      ) : null}
                      <span className={styles.qty} aria-label={`${item.quantity} adet`}>
                        {item.quantity}
                      </span>
                    </span>
                    <span className={styles.lineText}>
                      <span className={styles.lineName}>{item.productName}</span>
                      <span className={styles.lineVariant}>{item.variantName}</span>
                    </span>
                    <span className={styles.linePrice}>{formatPrice(item.priceKurus * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              <dl className={styles.sums}>
                <div>
                  <dt>Ara toplam</dt>
                  <dd>{formatPrice(cart.subtotalKurus)}</dd>
                </div>
                <div>
                  <dt>Kargo ({carrierName})</dt>
                  <dd className={freeShipping ? styles.free : undefined}>{shippingLabel}</dd>
                </div>
                {feeKurus > 0 && (
                  <div>
                    <dt>Kapıda ödeme bedeli</dt>
                    <dd>{formatPrice(feeKurus)}</dd>
                  </div>
                )}
              </dl>
              <div className={styles.total}>
                <span>Toplam</span>
                <span className={styles.totalAmount}>{totalLabel}</span>
              </div>
              <p className={styles.vat}>Tüm vergiler dahil{recipientPays ? " · kargo ücreti teslimatta ödenir" : ""}</p>
              {shippingSettings && !freeShipping && remainingFree > 0 && (
                <p className={styles.freeHint}>
                  {formatPrice(remainingFree)} daha ekleyin, kargo ücretsiz olsun.{" "}
                  <Link href="/urunler">Alışverişe devam</Link>
                </p>
              )}
            </div>
            <ul className={styles.assurances}>
              <li>
                <LockIcon size={14} /> Kart bilgileri bankada, 3D Secure ile
              </li>
              <li>
                <ReturnIcon /> 14 gün içinde cayma hakkı (açılmamış ürün)
              </li>
              <li>
                <StoreIcon /> Orhangazi Zeytinciler Çarşısı&apos;ndaki mağazamız
              </li>
            </ul>
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Bankanın ödeme sayfasına gizli form gönderimi (tarayıcı yönlendirmesi; alanlar sunucuda imzalandı) */
function submitPaymentForm(form: { action: string; fields: Record<string, string> }) {
  const el = document.createElement("form");
  el.method = "POST";
  el.action = form.action;
  el.style.display = "none";
  for (const [name, value] of Object.entries(form.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    el.appendChild(input);
  }
  document.body.appendChild(el);
  el.submit();
}

// ── Simgeler ──

const svg = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function MethodIcon({ id }: { id: PaymentMethodId }) {
  if (id === "CARD") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" strokeWidth="1.7" {...svg}>
        <rect x="2" y="5" width="20" height="14" rx="2.5" />
        <path d="M2 10h20M6 15h4" />
      </svg>
    );
  }
  if (id === "BANK_TRANSFER") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" strokeWidth="1.7" {...svg}>
        <path d="M3 10 12 4l9 6" />
        <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" strokeWidth="1.7" {...svg}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  );
}

function LockIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth="2.2" {...svg}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" strokeWidth="3" {...svg}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" strokeWidth="1.7" {...svg}>
      <path d="M3 6h11v9H3z" />
      <path d="M14 9h4l3 3v3h-7" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17.5" cy="17.5" r="1.8" />
    </svg>
  );
}

function ReturnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2.2" {...svg}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2.2" {...svg}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2.5" {...svg} style={{ animation: "spin 0.8s linear infinite" }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
