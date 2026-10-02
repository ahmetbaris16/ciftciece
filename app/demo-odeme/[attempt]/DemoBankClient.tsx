"use client";

/**
 * Demo banka sayfası (istemci): kart bilgileri → 6 haneli doğrulama kodu (gelen SMS ekranda) → sonuç → mağazaya dönüş.
 *
 * Kart bilgileri bu bileşenden çıkmaz: alanların `name`'i yoktur, form gönderilmez, sunucuya yalnız deneme no'su ve
 * girilen 6 haneli kod gider (POST /api/payment/demo). Doğrulama adımına geçerken alanlar temizlenir; yalnız son 4 hane
 * gösterilir. Onaydan sonra tarayıcı dönüş adresine gider; sipariş orada sunucuda doğrulanınca "Ödendi" olur.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatPrice } from "@/types";
import PaymentMarks from "@/components/payment/PaymentMarks";
import styles from "./demo-odeme.module.css";

type Step = "card" | "otp" | "result";
type Brand = "visa" | "mastercard" | "troy" | "amex" | null;
type CardField = "number" | "name" | "expiry" | "cvc";

interface Props {
  attemptId: string;
  merchant: string;
  reference: string;
  amountKurus: number;
  phoneHint: string | null;
  rules: { codeTtlMs: number; resendMs: number; maxWrong: number };
}

const TEST_CARD = { number: "4111 1111 1111 1111", name: "DEMO MÜŞTERİ", expiry: "12/30", cvc: "123" };
const BRAND_LABEL: Record<Exclude<Brand, null>, string> = { visa: "VISA", mastercard: "Mastercard", troy: "troy", amex: "AMEX" };

const onlyDigits = (s: string) => s.replace(/\D/g, "");

function brandOf(num: string): Brand {
  const d = onlyDigits(num);
  if (/^4/.test(d)) return "visa";
  if (/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/.test(d)) return "mastercard";
  if (/^9792/.test(d)) return "troy";
  if (/^3[47]/.test(d)) return "amex";
  return null;
}

function formatNumber(raw: string): string {
  const d = onlyDigits(raw);
  if (brandOf(d) === "amex") {
    const a = d.slice(0, 15);
    return [a.slice(0, 4), a.slice(4, 10), a.slice(10)].filter(Boolean).join(" ");
  }
  return d.slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** Kart numarası kontrol hanesi (Luhn) */
function luhnValid(num: string): boolean {
  const d = onlyDigits(num);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

function formatExpiry(raw: string, previous: string): string {
  const d = onlyDigits(raw).slice(0, 4);
  // Silerken "/" kendiliğinden geri gelmesin
  if (raw.length < previous.length) return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  if (d.length === 1 && Number(d) > 1) return `0${d}/`;
  if (d.length >= 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
}

function expiryError(value: string): string | null {
  const m = /^(\d{2})\/(\d{2})$/.exec(value);
  if (!m) return "Son kullanma tarihini AA/YY biçiminde girin.";
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return "Ay 01 ile 12 arasında olmalı.";
  const now = new Date();
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) return "Kartın süresi dolmuş.";
  return null;
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export default function DemoBankClient({ attemptId, merchant, reference, amountKurus, phoneHint, rules }: Props) {
  const [step, setStep] = useState<Step>("card");
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [flipped, setFlipped] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CardField, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exitHref, setExitHref] = useState<string | null>(null);
  const [masked, setMasked] = useState<{ last4: string; brand: Brand } | null>(null);
  const [code, setCode] = useState("");
  const [codeFocused, setCodeFocused] = useState(false);
  const [timers, setTimers] = useState<{ expiresAt: number; resendAt: number } | null>(null);
  const [now, setNow] = useState(0);
  const [sms, setSms] = useState<{ code: string; id: number } | null>(null);
  const [result, setResult] = useState<{ status: "approved" | "declined"; redirect: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);

  const brand = brandOf(number);
  const amount = formatPrice(amountKurus);

  // Geri sayım (kod süresi, yeniden gönderme)
  useEffect(() => {
    if (step !== "otp") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [step]);

  // Adım değişince odak: doğrulamada kod alanı, sonuçta başlık (ekran okuyucu yeni içeriği duyar)
  useEffect(() => {
    if (step === "otp") codeRef.current?.focus();
    else if (step === "result") headingRef.current?.focus();
  }, [step]);

  // Sonuçtan sonra mağazaya dönüş (sonuç orada sunucuda doğrulanır)
  useEffect(() => {
    if (!result) return;
    const t = window.setTimeout(() => window.location.assign(result.redirect), result.status === "approved" ? 1800 : 2600);
    return () => window.clearTimeout(t);
  }, [result]);

  const call = async (body: Record<string, string>) => {
    const res = await fetch("/api/payment/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId, ...body }),
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: res.ok, data };
  };

  const fail = (data: Record<string, unknown> | null, fallback: string) => {
    setError(typeof data?.error === "string" ? data.error : fallback);
    setExitHref(typeof data?.redirect === "string" ? data.redirect : null);
    setBusy(false);
  };

  const startCodeStep = (data: Record<string, unknown>) => {
    const sentAt = Date.now();
    const serverLeft = typeof data.expiresAt === "string" ? Date.parse(data.expiresAt) - sentAt : rules.codeTtlMs;
    setTimers({
      expiresAt: sentAt + Math.min(rules.codeTtlMs, Math.max(0, Number.isFinite(serverLeft) ? serverLeft : rules.codeTtlMs)),
      resendAt: sentAt + rules.resendMs,
    });
    setNow(sentAt);
    setSms({ code: String(data.code ?? ""), id: sentAt });
    setCode("");
  };

  const submitCard = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Partial<Record<CardField, string>> = {};
    if (!luhnValid(number)) errs.number = "Kart numarası geçersiz.";
    if (name.trim().length < 3) errs.name = "Kart üzerindeki adı girin.";
    const expErr = expiryError(expiry);
    if (expErr) errs.expiry = expErr;
    if (!new RegExp(`^\\d{${brand === "amex" ? 4 : 3}}$`).test(cvc)) errs.cvc = brand === "amex" ? "4 haneli güvenlik kodunu girin." : "3 haneli güvenlik kodunu girin.";
    setFieldErrors(errs);
    const first = (["number", "name", "expiry", "cvc"] as CardField[]).find((f) => errs[f]);
    if (first) {
      document.getElementById(`demo-${first}`)?.focus();
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await call({ action: "send-code" });
      if (!ok || !data) return fail(data, "Doğrulama kodu gönderilemedi. Tekrar deneyin.");
      setMasked({ last4: onlyDigits(number).slice(-4), brand });
      // Kart bilgileri doğrulama adımına taşınmaz: yalnız son 4 hane kalır
      setNumber("");
      setName("");
      setExpiry("");
      setCvc("");
      setFlipped(false);
      startCodeStep(data);
      setStep("otp");
      setBusy(false);
    } catch {
      fail(null, "Bağlantı sorunu oluştu. Tekrar deneyin.");
    }
  };

  const resend = async () => {
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await call({ action: "send-code" });
      if (!ok || !data) return fail(data, "Yeni kod gönderilemedi.");
      startCodeStep(data);
      setBusy(false);
      codeRef.current?.focus();
    } catch {
      fail(null, "Bağlantı sorunu oluştu. Tekrar deneyin.");
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Telefonunuza gelen 6 haneli kodu girin.");
      codeRef.current?.focus();
      return;
    }
    if (timers && now >= timers.expiresAt) {
      setError("Kodun süresi doldu. Yeni kod isteyin.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await call({ action: "verify-code", code });
      if (ok && data && (data.status === "approved" || data.status === "declined") && typeof data.redirect === "string") {
        setSms(null);
        setResult({ status: data.status, redirect: data.redirect });
        setStep("result");
        return;
      }
      setCode("");
      fail(data, "Kod doğrulanamadı. Tekrar deneyin.");
      codeRef.current?.focus();
    } catch {
      fail(null, "Bağlantı sorunu oluştu. Tekrar deneyin.");
    }
  };

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await call({ action: "cancel" });
      // Ödeme zaten sonuçlandıysa da dönüş adresi verilir: oraya gidilir
      if (typeof data?.redirect === "string") {
        window.location.assign(data.redirect);
        return;
      }
      fail(data, "İşlem yapılamadı. Tekrar deneyin.");
    } catch {
      fail(null, "Bağlantı sorunu oluştu. Tekrar deneyin.");
    }
  };

  const fillTestCard = () => {
    setNumber(TEST_CARD.number);
    setName(TEST_CARD.name);
    setExpiry(TEST_CARD.expiry);
    setCvc(TEST_CARD.cvc);
    setFieldErrors({});
    numberRef.current?.focus();
  };

  const codeLeft = timers ? timers.expiresAt - now : 0;
  const resendLeft = timers ? timers.resendAt - now : 0;
  const cardDigits = onlyDigits(number);
  const shownNumber = (() => {
    const pattern = brand === "amex" ? "#### ###### #####" : "#### #### #### ####";
    let i = 0;
    return pattern.replace(/#/g, () => cardDigits[i++] ?? "•");
  })();

  return (
    <>
      {sms && step === "otp" && (
        <div key={sms.id} className={styles.sms} role="status" aria-live="polite">
          <p className={styles.smsHead}>
            <span className={styles.smsApp}>Mesajlar</span>
            <span>şimdi</span>
          </p>
          <p className={styles.smsText}>
            {merchant} — {amount} tutarındaki internet alışverişiniz için doğrulama kodunuz: <strong>{sms.code}</strong>. Bu kodu
            kimseyle paylaşmayın.
          </p>
          <p className={styles.smsFoot}>
            <span>Demo: gerçek SMS gönderilmez, kod burada gösterilir.</span>
            <button type="button" className={styles.smsFill} onClick={() => { setCode(sms.code); codeRef.current?.focus(); }}>
              Kodu doldur
            </button>
            <button type="button" className={styles.smsClose} onClick={() => setSms(null)} aria-label="Mesajı kapat">
              ×
            </button>
          </p>
        </div>
      )}

      <main className={styles.sheet} aria-labelledby="demo-title">
        <header className={styles.bar}>
          <span className={styles.barTitle}>
            <LockGlyph /> 3-D Secure · Güvenli ödeme
          </span>
          <span className={styles.stamp} title="Gerçek ödeme alınmaz">
            DEMO
          </span>
        </header>

        <dl className={styles.receipt}>
          <div>
            <dt>İş yeri</dt>
            <dd>{merchant}</dd>
          </div>
          <div>
            <dt>Tutar</dt>
            <dd className={styles.amount}>{amount}</dd>
          </div>
          <div>
            <dt>Sipariş no</dt>
            <dd className={styles.ref}>{reference}</dd>
          </div>
        </dl>

        {step === "card" && (
          <form className={styles.body} onSubmit={submitCard} noValidate>
            <h1 id="demo-title" className={styles.h1}>
              Kart bilgileri
            </h1>

            <div className={`${styles.card} ${flipped ? styles.cardFlipped : ""}`} aria-hidden="true">
              <div className={`${styles.face} ${styles.front}`}>
                <span className={styles.chip} />
                <span className={styles.brand}>{brand ? BRAND_LABEL[brand] : ""}</span>
                <span className={styles.cardNumber}>{shownNumber}</span>
                <span className={styles.cardMeta}>
                  <span className={styles.cardName}>{name.trim() ? name.toLocaleUpperCase("tr") : "AD SOYAD"}</span>
                  <span>{expiry || "AA/YY"}</span>
                </span>
                <span className={styles.specimen}>ÖRNEK</span>
              </div>
              <div className={`${styles.face} ${styles.back}`}>
                <span className={styles.stripe} />
                <span className={styles.cvcStrip}>
                  <span>{cvc ? "•".repeat(cvc.length) : "CVC"}</span>
                </span>
                <span className={styles.specimen}>ÖRNEK</span>
              </div>
            </div>

            <label className={styles.field}>
              <span className={styles.label}>Kart numarası</span>
              <input
                id="demo-number"
                ref={numberRef}
                className={styles.input}
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                placeholder="0000 0000 0000 0000"
                value={number}
                onChange={(e) => setNumber(formatNumber(e.target.value))}
                aria-invalid={!!fieldErrors.number}
                aria-describedby={fieldErrors.number ? "demo-number-error" : undefined}
              />
              {fieldErrors.number && (
                <span id="demo-number-error" className={styles.fieldError}>
                  {fieldErrors.number}
                </span>
              )}
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Kart üzerindeki ad</span>
              <input
                id="demo-name"
                className={styles.input}
                autoComplete="off"
                spellCheck={false}
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü .'-]/g, ""))}
                aria-invalid={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? "demo-name-error" : undefined}
              />
              {fieldErrors.name && (
                <span id="demo-name-error" className={styles.fieldError}>
                  {fieldErrors.name}
                </span>
              )}
            </label>

            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>Son kullanma</span>
                <input
                  id="demo-expiry"
                  className={styles.input}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="AA/YY"
                  value={expiry}
                  onChange={(e) => setExpiry(formatExpiry(e.target.value, expiry))}
                  aria-invalid={!!fieldErrors.expiry}
                  aria-describedby={fieldErrors.expiry ? "demo-expiry-error" : undefined}
                />
                {fieldErrors.expiry && (
                  <span id="demo-expiry-error" className={styles.fieldError}>
                    {fieldErrors.expiry}
                  </span>
                )}
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Güvenlik kodu (CVC)</span>
                <input
                  id="demo-cvc"
                  className={styles.input}
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={brand === "amex" ? "4 hane" : "3 hane"}
                  value={cvc}
                  maxLength={brand === "amex" ? 4 : 3}
                  onChange={(e) => setCvc(onlyDigits(e.target.value).slice(0, brand === "amex" ? 4 : 3))}
                  onFocus={() => setFlipped(true)}
                  onBlur={() => setFlipped(false)}
                  aria-invalid={!!fieldErrors.cvc}
                  aria-describedby={fieldErrors.cvc ? "demo-cvc-error" : undefined}
                />
                {fieldErrors.cvc && (
                  <span id="demo-cvc-error" className={styles.fieldError}>
                    {fieldErrors.cvc}
                  </span>
                )}
              </label>
            </div>

            <button type="button" className={styles.linkBtn} onClick={fillTestCard}>
              Test kartıyla doldur
            </button>

            {error && (
              <p className={styles.error} role="alert">
                {error} {exitHref && <a href={exitHref}>Devam et</a>}
              </p>
            )}

            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? "Kod gönderiliyor…" : `Ödemeyi onayla · ${amount}`}
            </button>
            <button type="button" className={styles.secondary} onClick={cancel} disabled={busy}>
              Vazgeç, mağazaya dön
            </button>
          </form>
        )}

        {step === "otp" && (
          <form className={styles.body} onSubmit={submitCode} noValidate>
            <h1 id="demo-title" className={styles.h1}>
              Kart sahibini doğrulama
            </h1>
            <p className={styles.lead}>
              {masked?.brand ? `${BRAND_LABEL[masked.brand]} ` : ""}•••• {masked?.last4} kartınızla {amount} ödeme yapıyorsunuz.{" "}
              {phoneHint ? `${phoneHint} numaralı telefonunuza` : "Telefonunuza"} gelen 6 haneli kodu girin.
            </p>

            <div
              className={`${styles.otp} ${codeFocused ? styles.otpFocused : ""}`}
              onClick={() => codeRef.current?.focus()}
            >
              {Array.from({ length: 6 }, (_, i) => (
                <span
                  key={i}
                  className={`${styles.otpBox} ${i === 3 ? styles.otpGap : ""} ${codeFocused && i === Math.min(code.length, 5) ? styles.otpActive : ""}`}
                  aria-hidden="true"
                >
                  {code[i] ?? ""}
                </span>
              ))}
              <input
                ref={codeRef}
                className={styles.otpInput}
                aria-label="6 haneli doğrulama kodu"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setCode(onlyDigits(e.target.value).slice(0, 6));
                  setError(null);
                }}
                onFocus={() => setCodeFocused(true)}
                onBlur={() => setCodeFocused(false)}
              />
            </div>

            <p className={styles.timer} aria-live="off">
              {codeLeft > 0 ? (
                <>
                  Kodun geçerlilik süresi <strong>{mmss(codeLeft)}</strong>
                </>
              ) : (
                <strong>Kodun süresi doldu. Yeni kod isteyin.</strong>
              )}
            </p>

            {error && (
              <p className={styles.error} role="alert">
                {error} {exitHref && <a href={exitHref}>Devam et</a>}
              </p>
            )}

            <button type="submit" className={styles.primary} disabled={busy || codeLeft <= 0}>
              {busy ? "Doğrulanıyor…" : "Onayla"}
            </button>
            <div className={styles.inline}>
              <button type="button" className={styles.linkBtn} onClick={resend} disabled={busy || resendLeft > 0}>
                {resendLeft > 0 ? `Kodu yeniden gönder (${Math.ceil(resendLeft / 1000)} sn)` : "Kodu yeniden gönder"}
              </button>
              <button type="button" className={styles.linkBtn} onClick={cancel} disabled={busy}>
                Vazgeç
              </button>
            </div>
            <p className={styles.hint}>Kod {rules.maxWrong} kez yanlış girilirse ödeme onaylanmaz.</p>
          </form>
        )}

        {step === "result" && result && (
          <section className={`${styles.body} ${styles.result}`} aria-live="polite">
            <span className={`${styles.resultIcon} ${result.status === "approved" ? styles.ok : styles.no}`} aria-hidden="true">
              {result.status === "approved" ? <CheckGlyph /> : <CrossGlyph />}
            </span>
            <h1 id="demo-title" ref={headingRef} tabIndex={-1} className={styles.h1}>
              {result.status === "approved" ? "Ödeme onaylandı" : "Ödeme onaylanmadı"}
            </h1>
            <p className={styles.lead}>
              {result.status === "approved"
                ? `${amount} tutarındaki ödeme onaylandı. Mağazaya dönülüyor; siparişiniz orada doğrulanıp onaylanacak.`
                : "Doğrulama tamamlanamadı, kartınızdan çekim yapılmadı. Ödeme adımına dönülüyor."}
            </p>
            <a className={styles.secondary} href={result.redirect}>
              Hemen dön
            </a>
          </section>
        )}

        <footer className={styles.foot}>
          <p>
            Bu sayfa, sanal POS bağlanana kadar kullanılan banka ödeme sayfasının demo kopyasıdır: gerçek ödeme alınmaz, kart
            bilgileri hiçbir yere gönderilmez ve saklanmaz. Canlıda bu adım Akbank&apos;ın güvenli ödeme sayfasında yapılır.
          </p>
          <PaymentMarks compact showSecure={false} />
        </footer>
      </main>
    </>
  );
}

function LockGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CrossGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
