"use client";

/**
 * Checkout Sayfası — Guest Checkout
 * /odeme
 *
 * Adımlar:
 * 1. İletişim (ad, e-posta, telefon)
 * 2. Teslimat adresi (kargo: yalnız Yurtiçi Kargo; ücret sepetin ağırlık/desisine göre sunucuda hesaplanır)
 * 3. Ödeme — yöntem seçimi (kart / havale-EFT / kapıda ödeme; yalnız kullanılabilir olanlar)
 *    kart: checkout API → payment/create → güvenli ödeme sayfası
 *    havale, kapıda ödeme: checkout API → sipariş sayfası (IBAN / teslimatta ödeme bilgisi)
 *
 * Güvenlik:
 * - Frontend fiyatına güvenilmez — server hesaplar
 * - Ödeme provider'ı stub (geliştirme) veya gerçek (production)
 */

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/lib/cart/CartContext";
import { formatPrice } from "@/types";
import {
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
import { isOptionAllowed, type PaymentMethodId } from "@/lib/payment/methods";
import { CHECKOUT_TERMS_VERSION, LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import { checkoutKeyFor, forgetCheckoutKey } from "@/lib/checkout/client-key";
import styles from "./page.module.css";

type Step = "iletisim" | "teslimat" | "odeme";

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

const STEP_LABELS: Record<Step, string> = {
  iletisim: "İletişim",
  teslimat: "Teslimat",
  odeme: "Ödeme",
};

const STEPS: Step[] = ["iletisim", "teslimat", "odeme"];

const PAYMENT_RETURN_ERRORS: Record<string, string> = {
  payment_failed: "Ödeme işlemi başarısız oldu. Lütfen tekrar deneyin.",
  payment_not_found: "Ödeme kaydı bulunamadı. Lütfen tekrar sipariş verin.",
  payment_error: "Ödeme sırasında bir hata oluştu. Lütfen tekrar deneyin.",
  // Ödeme sonucu sağlayıcıdan doğrulanamadı: para çekilmiş olabilir, müşteri hemen tekrar ödemesin
  payment_unverified:
    "Ödemenizin sonucunu şu anda doğrulayamadık. Kartınızdan çekim yapıldıysa siparişiniz birkaç dakika içinde onaylanır; lütfen tekrar ödeme yapmadan önce “Sipariş Takibi”nden kontrol edin ya da bizi arayın: 0532 682 53 72",
};

export default function OdemePage() {
  return (
    <Suspense fallback={<div className={styles.page}><div className={styles.container}><div className={styles.loading}>Yükleniyor…</div></div></div>}>
      <OdemeContent />
    </Suspense>
  );
}

function OdemeContent() {
  const { cart, isHydrated } = useCart();
  const router = useRouter();

  // Ödeme sağlayıcısından hata ile dönüş (?error=...) — render sırasında türetilir
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const returnError = errorParam
    ? PAYMENT_RETURN_ERRORS[errorParam] ?? "Bir hata oluştu. Lütfen tekrar deneyin."
    : null;

  const [currentStep, setCurrentStep] = useState<Step>(() => (errorParam ? "odeme" : "iletisim"));
  const [contact, setContact] = useState<ContactInfo>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [shipping, setShipping] = useState<ShippingInfo>({
    address: "",
    district: "",
    city: "",
    postalCode: "",
  });
  const shippingState = useShippingSettings();
  const quoteState = useShippingQuote(cart.items);
  const paymentOptionsState = usePaymentOptions();
  const [chosenMethod, setChosenMethod] = useState<PaymentMethodId | null>(null);
  // Ön Bilgilendirme Formu + Mesafeli Satış Sözleşmesi onayı (sunucu sürümle birlikte kaydeder)
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<CheckoutField, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(() => returnError);
  // Sipariş oluştu ama ödeme başlatılamadıysa aynı siparişle tekrar denenir —
  // her denemede yeni sipariş (ve ikinci kez stok düşümü) oluşmasın.
  const [pendingOrder, setPendingOrder] = useState<{ id: string; reference: string; key: string } | null>(null);

  // Üye girişliyse iletişim bilgileri hesaptan doldurulur (yalnız boş alanlar; müşteri değiştirebilir)
  const { data: session, status: sessionStatus } = useSession();
  const isCustomer =
    sessionStatus === "authenticated" && (session?.user as { role?: string } | undefined)?.role === "CUSTOMER";
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!isCustomer || prefilledRef.current) return;
    prefilledRef.current = true;
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


  // ── Sipariş Gönder — useCallback MUST be before early returns (React hooks rules)
  const handlePlaceOrder = useCallback(async (paymentMethod: PaymentMethodId | null) => {
    setIsSubmitting(true);
    setSubmitError(null);

    const items = cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
    if (!paymentMethod) {
      setSubmitError(CHECKOUT_MESSAGES.paymentMethod);
      setIsSubmitting(false);
      return;
    }
    if (!acceptTerms) {
      setErrors((e) => ({ ...e, acceptTerms: CHECKOUT_MESSAGES.acceptTerms }));
      setIsSubmitting(false);
      document.getElementById("accept-terms")?.focus();
      return;
    }
    const orderKey = JSON.stringify({ items, contact, shipping, paymentMethod });
    // Aynı bilgilerle tekrar gönderim (yanıt kayboldu, sayfa yenilendi, iyzico'dan dönüldü) aynı anahtarı
    // taşır: sunucu yeni sipariş açmaz, mevcut siparişi döndürür.
    const idempotencyKey = checkoutKeyFor(orderKey);

    const fail = (message: string) => {
      setSubmitError(message);
      setIsSubmitting(false);
    };

    try {
      let order = pendingOrder && pendingOrder.key === orderKey ? pendingOrder : null;

      if (!order) {
        const checkoutRes = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items,
            contact,
            shipping: { ...shipping, postalCode: shipping.postalCode || undefined },
            paymentMethod,
            acceptTerms: true,
            termsVersion: CHECKOUT_TERMS_VERSION,
            idempotencyKey,
          }),
        });
        const checkoutData = await checkoutRes.json().catch(() => null);

        if (!checkoutRes.ok || !checkoutData?.success) {
          // Anahtar başka içerikle kullanılmış ya da o sipariş kapanmış: sonraki denemede yeni anahtar
          if (checkoutData?.code === "IDEMPOTENCY_CONFLICT" || checkoutData?.code === "ORDER_CLOSED") {
            forgetCheckoutKey();
            setPendingOrder(null);
          }
          // Sunucu mesajları zaten kısa ve Türkçe; alan hatası varsa ilgili adıma dön
          const fieldErrors = (checkoutData?.fieldErrors ?? {}) as Partial<Record<CheckoutField, string>>;
          if (Object.keys(fieldErrors).length > 0) {
            setErrors(fieldErrors);
            const contactFields: CheckoutField[] = ["firstName", "lastName", "email", "phone"];
            const keys = Object.keys(fieldErrors);
            setCurrentStep(
              keys.some((k) => contactFields.includes(k as CheckoutField))
                ? "iletisim"
                : keys.every((k) => k === "paymentMethod" || k === "acceptTerms")
                  ? "odeme"
                  : "teslimat"
            );
          }
          return fail(typeof checkoutData?.error === "string" ? checkoutData.error : CHECKOUT_MESSAGES.orderFailed);
        }

        order = { id: checkoutData.orderId as string, reference: checkoutData.order?.reference ?? "", key: orderKey };

        // Havale / kapıda ödeme: ödeme sağlayıcısı yok — sipariş sayfası IBAN'ı ya da teslimat bilgisini gösterir
        if (checkoutData.nextStep === "order") {
          router.push(`/siparis/${order.reference}`);
          return;
        }
        setPendingOrder(order);
      }

      const paymentRes = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const paymentData = await paymentRes.json().catch(() => null);

      if (!paymentRes.ok) {
        const code = paymentData?.code;
        // Ödeme zaten alınmış ya da kontrol ediliyorsa müşteri tekrar ödemesin: sipariş sayfasına
        if ((code === "ALREADY_PAID" || code === "REVIEW") && typeof paymentData?.reference === "string") {
          router.push(`/siparis/${paymentData.reference}`);
          return;
        }
        // Sipariş artık ödenebilir durumda değilse (kapandı / süresi doldu) bir sonraki denemede yeni sipariş açılsın
        if (code === "NOT_PENDING" || code === "EXPIRED") {
          setPendingOrder(null);
          forgetCheckoutKey();
        }
        return fail(typeof paymentData?.error === "string" ? paymentData.error : CHECKOUT_MESSAGES.paymentFailed);
      }

      // Sepet burada temizlenmez: ödeme onaylanınca sipariş sayfası temizler.
      // Ödeme başarısız dönerse müşteri sepetini kaybetmez.
      setPendingOrder(null);

      if (paymentData?.form?.action && paymentData.form.fields) {
        // Banka ortak ödeme sayfası: imzalı alanlar POST edilir (kart bilgisi bankanın sayfasında girilir)
        submitPaymentForm(paymentData.form as { action: string; fields: Record<string, string> });
      } else if (paymentData?.redirectUrl) {
        window.location.href = paymentData.redirectUrl;
      } else if (paymentData?.checkoutFormHtml) {
        const win = window.open("", "_blank");
        if (win) win.document.write(paymentData.checkoutFormHtml);
      } else {
        router.push(`/siparis/${order.reference}`);
      }
    } catch (err) {
      console.error("[checkout] Beklenmeyen hata:", err);
      fail("Bağlantı sorunu oluştu. İnternetinizi kontrol edip tekrar deneyin.");
    }
  }, [cart.items, contact, shipping, router, pendingOrder, acceptTerms]);

  // Hydration bekleniyor
  if (!isHydrated) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.loading}>Yükleniyor…</div>
        </div>
      </div>
    );
  }

  // Boş sepet
  if (cart.items.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.emptyState}>
            {returnError ? (
              <p role="alert">{returnError}</p>
            ) : (
              <p>Sepetiniz boş. Ödeme sayfasına erişmek için sepetinize ürün ekleyin.</p>
            )}
            <Link href="/urunler" className={styles.backBtn}>
              Ürünlere Git
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentStepIndex = STEPS.indexOf(currentStep);

  // ── Kargo: Yurtiçi Kargo (gösterim; tutar sunucuda yeniden hesaplanır). Ücret bilinmiyorsa rakam yok. ──
  const shippingSettings = shippingState.status === "ready" ? shippingState.settings : null;
  const quote = quoteState.status === "ready" ? quoteState.quote : null;
  const carrierName = quote?.carrierName ?? shippingSettings?.carrierName ?? "Yurtiçi Kargo";
  const freeShipping = quote?.status === "free";
  const recipientPays = quote?.status === "recipient";
  const shippingKnown = quote?.status === "free" || quote?.status === "priced" || recipientPays;
  const shippingUnknown = quote?.status === "unknown" || quoteState.status === "error";
  const shippingKurus = quote && quote.status !== "unknown" ? quote.feeKurus : 0;
  // ── Ödeme yöntemi (gösterim; sunucu yeniden doğrular) ──
  const paymentOptions = paymentOptionsState.status === "ready" ? paymentOptionsState.options : [];
  const allowedOptions = paymentOptions.filter((o) => isOptionAllowed(o, cart.subtotalKurus + shippingKurus));
  const selectedOption = allowedOptions.find((o) => o.id === chosenMethod) ?? allowedOptions[0] ?? null;
  const methodFeeKurus = selectedOption?.feeKurus ?? 0;
  const noPaymentMethod = paymentOptionsState.status !== "loading" && allowedOptions.length === 0;
  const totalKurus = cart.subtotalKurus + shippingKurus + methodFeeKurus;
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
  const parcelNote = quote?.status === "priced" && quote.parcelCount > 1 ? `${quote.parcelCount} koli` : null;
  // Kargo ücreti bilinmeden genel toplam gösterilmez: "ara toplam + kargo"
  const totalLabel = shippingKnown ? formatPrice(totalKurus) : `${formatPrice(cart.subtotalKurus)} + kargo`;

  const validateContact = (): boolean => {
    const newErrors = validateStep(ContactSchema, contact);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateShipping = (): boolean => {
    const newErrors = validateStep(ShippingSchema, shipping);
    setErrors(newErrors);
    // Kargo ücreti hesaplanamıyorsa (ya da hâlâ hesaplanıyorsa) ödeme adımına geçilmez
    return Object.keys(newErrors).length === 0 && shippingKnown;
  };

  /** Yazarken ilgili alanın hatasını temizler */
  const clearError = (field: CheckoutField) =>
    setErrors((e) => {
      if (!e[field]) return e;
      const next = { ...e };
      delete next[field];
      return next;
    });

  const handleNext = () => {
    if (currentStep === "iletisim") {
      if (!validateContact()) return;
      setCurrentStep("teslimat");
    } else if (currentStep === "teslimat") {
      if (!validateShipping()) return;
      setCurrentStep("odeme");
    }
  };

  const handleBack = () => {
    if (currentStep === "teslimat") setCurrentStep("iletisim");
    if (currentStep === "odeme") setCurrentStep("teslimat");
  };


  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Logo / back to cart */}
        <div className={styles.topBar}>
          <Link href="/" className={styles.logoLink}>
            Çiftçi Ece
          </Link>
          <Link href="/sepet" className={styles.cartLink}>
            ← Sepete Dön
          </Link>
        </div>

        <div className={styles.layout}>
          {/* Form */}
          <div className={styles.formSection}>
            {/* Steps indicator */}
            <nav className={styles.steps} aria-label="Ödeme adımları">
              {STEPS.map((step, i) => {
                const isDone = i < currentStepIndex;
                const isActive = step === currentStep;
                return (
                  <div key={step} className={styles.stepItem}>
                    <button
                      className={`${styles.stepBtn} ${isActive ? styles.stepActive : ""} ${isDone ? styles.stepDone : ""}`}
                      onClick={() => {
                        if (isDone) setCurrentStep(step);
                      }}
                      disabled={!isDone}
                      aria-current={isActive ? "step" : undefined}
                    >
                      <span className={styles.stepNum}>
                        {isDone ? <CheckMini /> : i + 1}
                      </span>
                      <span className={styles.stepLabel}>{STEP_LABELS[step]}</span>
                    </button>
                    {i < STEPS.length - 1 && (
                      <span className={`${styles.stepDivider} ${isDone ? styles.stepDividerDone : ""}`} aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </nav>

            {/* Step: İletişim */}
            {currentStep === "iletisim" && (
              <div className={styles.stepContent}>
                <h2 className={styles.stepTitle}>İletişim Bilgileri</h2>
                {isCustomer ? (
                  <p className={styles.memberNote}>
                    Üye olarak sipariş veriyorsunuz; siparişiniz <Link href="/hesabim">Hesabım → Siparişlerim</Link>&apos;de görünecek.
                  </p>
                ) : sessionStatus !== "loading" ? (
                  <p className={styles.memberNote}>
                    Üye misiniz? <Link href="/giris?next=/odeme">Giriş yapın</Link>; bilgileriniz hazır gelsin, siparişinizi
                    hesabınızdan takip edin. Üye olmadan da devam edebilirsiniz.
                  </p>
                ) : null}
                <div className={styles.formGrid}>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="firstName" className={styles.label}>Ad</label>
                    <input
                      id="firstName"
                      type="text"
                      autoComplete="given-name"
                      className={`${styles.input} ${errors.firstName ? styles.inputError : ""}`}
                      value={contact.firstName}
                      onChange={(e) => { setContact((c) => ({ ...c, firstName: e.target.value })); clearError("firstName"); }}
                    />
                    {errors.firstName && <span className={styles.error} role="alert">{errors.firstName}</span>}
                  </div>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="lastName" className={styles.label}>Soyad</label>
                    <input
                      id="lastName"
                      type="text"
                      autoComplete="family-name"
                      className={`${styles.input} ${errors.lastName ? styles.inputError : ""}`}
                      value={contact.lastName}
                      onChange={(e) => { setContact((c) => ({ ...c, lastName: e.target.value })); clearError("lastName"); }}
                    />
                    {errors.lastName && <span className={styles.error} role="alert">{errors.lastName}</span>}
                  </div>
                  <div className={`${styles.fieldGroup} ${styles.fullWidth}`}>
                    <label htmlFor="email" className={styles.label}>E-posta</label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
                      value={contact.email}
                      onChange={(e) => { setContact((c) => ({ ...c, email: e.target.value })); clearError("email"); }}
                    />
                    {errors.email && <span className={styles.error} role="alert">{errors.email}</span>}
                  </div>
                  <div className={`${styles.fieldGroup} ${styles.fullWidth}`}>
                    <label htmlFor="phone" className={styles.label}>Cep Telefonu</label>
                    <input
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="05XX XXX XX XX"
                      className={`${styles.input} ${errors.phone ? styles.inputError : ""}`}
                      value={contact.phone}
                      maxLength={14}
                      aria-invalid={!!errors.phone}
                      aria-describedby={errors.phone ? "phone-error" : "phone-hint"}
                      onChange={(e) => {
                        // Harf kabul edilmez; "05XX XXX XX XX" biçiminde otomatik düzenlenir
                        setContact((c) => ({ ...c, phone: formatTrPhoneInput(e.target.value) }));
                        clearError("phone");
                      }}
                    />
                    {errors.phone ? (
                      <span id="phone-error" className={styles.error} role="alert">{errors.phone}</span>
                    ) : (
                      <span id="phone-hint" className={styles.hint}>Kargo bilgilendirmesi bu numaraya gönderilir.</span>
                    )}
                  </div>
                </div>
                <div className={styles.actions}>
                  <button className={styles.nextBtn} onClick={handleNext}>
                    Devam Et — Teslimat
                  </button>
                </div>
              </div>
            )}

            {/* Step: Teslimat */}
            {currentStep === "teslimat" && (
              <div className={styles.stepContent}>
                <h2 className={styles.stepTitle}>Teslimat Adresi</h2>
                <div className={styles.formGrid}>
                  <div className={`${styles.fieldGroup} ${styles.fullWidth}`}>
                    <label htmlFor="address" className={styles.label}>Açık Adres</label>
                    <textarea
                      id="address"
                      autoComplete="street-address"
                      rows={3}
                      placeholder="Mahalle, cadde, sokak, bina no, daire…"
                      className={`${styles.textarea} ${errors.address ? styles.inputError : ""}`}
                      value={shipping.address}
                      onChange={(e) => { setShipping((s) => ({ ...s, address: e.target.value })); clearError("address"); }}
                    />
                    {errors.address && <span className={styles.error} role="alert">{errors.address}</span>}
                  </div>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="district" className={styles.label}>İlçe</label>
                    <input
                      id="district"
                      type="text"
                      autoComplete="address-level3"
                      className={`${styles.input} ${errors.district ? styles.inputError : ""}`}
                      value={shipping.district}
                      onChange={(e) => { setShipping((s) => ({ ...s, district: e.target.value })); clearError("district"); }}
                    />
                    {errors.district && <span className={styles.error} role="alert">{errors.district}</span>}
                  </div>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="city" className={styles.label}>Şehir</label>
                    <input
                      id="city"
                      type="text"
                      autoComplete="address-level1"
                      className={`${styles.input} ${errors.city ? styles.inputError : ""}`}
                      value={shipping.city}
                      onChange={(e) => { setShipping((s) => ({ ...s, city: e.target.value })); clearError("city"); }}
                    />
                    {errors.city && <span className={styles.error} role="alert">{errors.city}</span>}
                  </div>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="postalCode" className={styles.label}>
                      Posta Kodu <span className={styles.optional}>(isteğe bağlı)</span>
                    </label>
                    <input
                      id="postalCode"
                      type="text"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      maxLength={5}
                      pattern="[0-9]{5}"
                      placeholder="16800"
                      aria-invalid={!!errors.postalCode}
                      className={`${styles.input} ${errors.postalCode ? styles.inputError : ""}`}
                      value={shipping.postalCode}
                      onChange={(e) => {
                        // Sadece rakam
                        const val = e.target.value.replace(/\D/g, "").slice(0, 5);
                        setShipping((s) => ({ ...s, postalCode: val }));
                        clearError("postalCode");
                      }}
                    />
                    {errors.postalCode && <span className={styles.error} role="alert">{errors.postalCode}</span>}
                  </div>
                </div>

                <section className={styles.carrierFieldset} aria-labelledby="shipping-heading">
                  <h3 id="shipping-heading" className={styles.label}>Kargo</h3>
                  <div className={`${styles.carrierOption} ${styles.carrierSelected}`}>
                    <TruckIcon />
                    <span className={styles.carrierName}>
                      {carrierName}
                      {parcelNote && <span className={styles.carrierMeta}> · {parcelNote}</span>}
                    </span>
                    <span className={`${styles.carrierPrice} ${freeShipping ? styles.freeShipping : ""}`} aria-live="polite">
                      {shippingLabel}
                    </span>
                  </div>
                  <p className={styles.carrierInfo}>{SHIPPING_BASIS_NOTE}</p>
                  {recipientPays && <p className={styles.recipientNote}>{RECIPIENT_PAYS_NOTE}</p>}
                  {shippingSettings && !freeShipping && remainingFree > 0 && (
                    <p className={styles.carrierInfo}>
                      {formatPrice(shippingSettings.freeThresholdKurus)} ve üzeri siparişlerde kargo ücretsiz —{" "}
                      {formatPrice(remainingFree)} daha ekleyin.
                    </p>
                  )}
                  {shippingUnknown && (
                    <p className={styles.error} role="alert">
                      {CHECKOUT_MESSAGES.shippingUnknown}
                    </p>
                  )}
                </section>
                <div className={styles.actions}>
                  <button className={styles.backBtn2} onClick={handleBack} type="button">
                    ← Geri
                  </button>
                  <button className={styles.nextBtn} onClick={handleNext}>
                    Devam Et — Ödeme
                  </button>
                </div>
              </div>
            )}

            {/* Step: Ödeme */}
            {currentStep === "odeme" && (
              <div className={styles.stepContent}>
                <h2 className={styles.stepTitle}>Ödeme</h2>

                {/* Sipariş özeti (kompakt) */}
                <div className={styles.confirmSummary}>
                  <div className={styles.confirmRow}>
                    <span>Teslimat</span>
                    <span>{contact.firstName} {contact.lastName}</span>
                  </div>
                  <div className={styles.confirmRow}>
                    <span>Adres</span>
                    <span>{shipping.district}, {shipping.city}</span>
                  </div>
                  <div className={styles.confirmRow}>
                    <span>Kargo firması</span>
                    <span>{carrierName}</span>
                  </div>
                  <div className={styles.confirmRow}>
                    <span>Ara toplam</span>
                    <span>{formatPrice(cart.subtotalKurus)}</span>
                  </div>
                  <div className={styles.confirmRow}>
                    <span>Kargo ücreti</span>
                    <span className={freeShipping ? styles.freeShipping : undefined}>{shippingLabel}</span>
                  </div>
                  {methodFeeKurus > 0 && (
                    <div className={styles.confirmRow}>
                      <span>Kapıda ödeme bedeli</span>
                      <span>{formatPrice(methodFeeKurus)}</span>
                    </div>
                  )}
                  <div className={`${styles.confirmRow} ${styles.confirmTotal}`}>
                    <span>Genel toplam</span>
                    <span>{totalLabel}</span>
                  </div>
                </div>

                {/* Hata mesajı */}
                {submitError && (
                  <div className={styles.submitError} role="alert">
                    <AlertIcon />
                    <span>{submitError}</span>
                  </div>
                )}

                <p className={styles.carrierInfo}>{SHIPPING_BASIS_NOTE}</p>
                {recipientPays && <p className={styles.recipientNote}>{RECIPIENT_PAYS_NOTE}</p>}
                {shippingUnknown && (
                  <p className={styles.error} role="alert">
                    {CHECKOUT_MESSAGES.shippingUnknown}
                  </p>
                )}

                <fieldset className={styles.methodFieldset}>
                  <legend className={styles.methodLegend}>Ödeme yöntemi</legend>
                  {paymentOptionsState.status === "loading" ? (
                    <p className={styles.carrierInfo}>Ödeme seçenekleri yükleniyor…</p>
                  ) : noPaymentMethod ? (
                    <p className={styles.error} role="alert">
                      {paymentOptionsState.status === "error"
                        ? "Ödeme seçenekleri yüklenemedi. Lütfen sayfayı yenileyin."
                        : CHECKOUT_MESSAGES.noPaymentMethod}
                    </p>
                  ) : (
                    <div className={styles.methodList}>
                      {allowedOptions.map((o) => {
                        const checked = selectedOption?.id === o.id;
                        return (
                          <label key={o.id} className={`${styles.methodOption} ${checked ? styles.carrierSelected : ""}`}>
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
                            <span className={styles.methodText}>
                              <span className={styles.methodTitle}>
                                <MethodIcon id={o.id} />
                                {o.title}
                                {o.feeKurus > 0 && <span className={styles.carrierMeta}> · +{formatPrice(o.feeKurus)}</span>}
                              </span>
                              <span className={styles.methodDesc}>{o.description}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </fieldset>

                <div className={styles.termsBox}>
                  <label className={styles.termsLabel}>
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
                      <Link href={LEGAL_DOCUMENTS.PRE_INFORMATION_FORM.path} target="_blank" rel="noopener">
                        {LEGAL_DOCUMENTS.PRE_INFORMATION_FORM.title}
                      </Link>
                      &apos;nu ve{" "}
                      <Link href={LEGAL_DOCUMENTS.DISTANCE_SALES_CONTRACT.path} target="_blank" rel="noopener">
                        {LEGAL_DOCUMENTS.DISTANCE_SALES_CONTRACT.title}
                      </Link>
                      &apos;ni okudum, onaylıyorum.
                    </span>
                  </label>
                  {errors.acceptTerms && (
                    <span id="terms-error" className={styles.error} role="alert">{errors.acceptTerms}</span>
                  )}
                </div>

                <div className={styles.paymentNote}>
                  <LockIcon />
                  <p>Sipariş bilgileriniz güvenli şekilde işlenir.</p>
                </div>

                <div className={styles.actions}>
                  <button
                    className={styles.backBtn2}
                    onClick={handleBack}
                    type="button"
                    disabled={isSubmitting}
                  >
                    ← Geri
                  </button>
                  <button
                    className={styles.submitBtn}
                    onClick={() => handlePlaceOrder(selectedOption?.id ?? null)}
                    disabled={isSubmitting || !shippingKnown || !selectedOption}
                    id="place-order-btn"
                  >
                    {isSubmitting ? (
                      <>
                        <SpinnerIcon />
                        İşleniyor…
                      </>
                    ) : (
                      <>
                        <LockMiniIcon />
                        {(() => {
                          const verb = selectedOption?.id === "CARD" ? "Ödemeye Geç" : "Siparişi Onayla";
                          return shippingKnown ? `${verb} — ${formatPrice(totalKurus)}` : verb;
                        })()}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Order Summary Sidebar */}
          <aside className={styles.summary}>
            <h3 className={styles.summaryTitle}>Sipariş Özeti</h3>
            <ul className={styles.summaryItems}>
              {cart.items.map((item) => (
                <li key={item.variantId} className={styles.summaryItem}>
                  <div className={styles.summaryItemInfo}>
                    <span className={styles.summaryItemName}>{item.productName}</span>
                    <span className={styles.summaryItemVariant}>
                      {item.variantName} × {item.quantity}
                    </span>
                  </div>
                  <span className={styles.summaryItemPrice}>
                    {formatPrice(item.priceKurus * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className={styles.summaryTotal}>
              <span>Ara Toplam</span>
              <span>{formatPrice(cart.subtotalKurus)}</span>
            </div>
            <div className={styles.summaryShipping}>
              <span>Kargo firması</span>
              <span>{carrierName}</span>
            </div>
            <div className={styles.summaryShipping}>
              <span>Kargo ücreti</span>
              <span className={freeShipping ? styles.freeShipping : undefined}>{shippingLabel}</span>
            </div>
            {methodFeeKurus > 0 && (
              <div className={styles.summaryShipping}>
                <span>Kapıda ödeme bedeli</span>
                <span>{formatPrice(methodFeeKurus)}</span>
              </div>
            )}
            <div className={`${styles.summaryTotal} ${styles.summaryGrandTotal}`}>
              <span>Genel Toplam</span>
              <span>{totalLabel}</span>
            </div>
            <p className={styles.shippingBasis}>
              {SHIPPING_BASIS_NOTE}
              {recipientPays && <> {RECIPIENT_PAYS_NOTE}</>}
            </p>
            {shippingSettings && !freeShipping && remainingFree > 0 && (
              <p className={styles.freeShippingHint}>
                {formatPrice(remainingFree)} daha ekleyin, kargo ücretsiz olsun.
              </p>
            )}
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

// ── Icon Helpers ────────────────────────────────────────────

function MethodIcon({ id }: { id: PaymentMethodId }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    style: { flexShrink: 0 },
  };
  if (id === "CARD") {
    return (
      <svg {...common}>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20M6 15h4" />
      </svg>
    );
  }
  if (id === "BANK_TRANSFER") {
    return (
      <svg {...common}>
        <path d="M3 10 12 4l9 6" />
        <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M3 6h11v9H3z" />
      <path d="M14 9h4l3 3v3h-7" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17.5" cy="17.5" r="1.8" />
    </svg>
  );
}

function CheckMini() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function LockMiniIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ animation: "spin 0.8s linear infinite" }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
