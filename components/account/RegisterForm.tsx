"use client";

/**
 * Üye ol — /api/account/register ile hesap açar, ardından aynı bilgilerle giriş yapar
 * ve ?next= sayfasına (varsayılan Hesabım) döner. Kurallar sunucuyla aynı (lib/validation/account).
 */

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { formatTrPhoneInput } from "@/lib/validation/checkout";
import {
  ACCOUNT_MESSAGES,
  RegisterSchema,
  accountFieldErrors,
  type AccountField,
} from "@/lib/validation/account";
import styles from "./Auth.module.css";

type Errors = Partial<Record<AccountField, string>>;

export default function RegisterForm({ next }: { next: string }) {
  const router = useRouter();
  const id = useId();
  const [values, setValues] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    acceptTerms: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key as AccountField]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsed = RegisterSchema.safeParse(values);
    if (!parsed.success) {
      const { fieldErrors } = accountFieldErrors(parsed.error);
      setErrors(fieldErrors);
      const first = Object.keys(fieldErrors)[0];
      if (first) document.getElementById(`${id}-${first}`)?.focus();
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/account/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErrors(data?.fieldErrors ?? {});
        setFormError(data?.error ?? ACCOUNT_MESSAGES.unavailable);
        setLoading(false);
        return;
      }

      const login = await signIn("customer", {
        email: parsed.data.email,
        password: values.password,
        redirect: false,
      });
      if (!login || login.error) {
        // Hesap açıldı ama oturum açılamadı: giriş sayfasına yönlendir
        router.replace(`/giris?next=${encodeURIComponent(next)}`);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setFormError(ACCOUNT_MESSAGES.unavailable);
      setLoading(false);
    }
  };

  const err = (f: AccountField) =>
    errors[f] ? (
      <p id={`${id}-${f}-error`} className={styles.fieldError}>
        {errors[f]}
      </p>
    ) : null;

  const aria = (f: AccountField) => ({
    "aria-invalid": errors[f] ? true : undefined,
    "aria-describedby": errors[f] ? `${id}-${f}-error` : undefined,
  });

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor={`${id}-firstName`} className={styles.label}>
            Ad
          </label>
          <input
            id={`${id}-firstName`}
            className={styles.input}
            value={values.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            autoComplete="given-name"
            {...aria("firstName")}
          />
          {err("firstName")}
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-lastName`} className={styles.label}>
            Soyad
          </label>
          <input
            id={`${id}-lastName`}
            className={styles.input}
            value={values.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            autoComplete="family-name"
            {...aria("lastName")}
          />
          {err("lastName")}
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor={`${id}-email`} className={styles.label}>
          E-posta
        </label>
        <input
          id={`${id}-email`}
          type="email"
          className={styles.input}
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          autoComplete="email"
          inputMode="email"
          placeholder="ornek@eposta.com"
          {...aria("email")}
        />
        {err("email")}
      </div>

      <div className={styles.field}>
        <label htmlFor={`${id}-phone`} className={styles.label}>
          Cep telefonu <span className={styles.optional}>(isteğe bağlı)</span>
        </label>
        <input
          id={`${id}-phone`}
          type="tel"
          className={styles.input}
          value={values.phone}
          onChange={(e) => set("phone", formatTrPhoneInput(e.target.value))}
          autoComplete="tel-national"
          inputMode="tel"
          placeholder="05XX XXX XX XX"
          {...aria("phone")}
        />
        {err("phone") ?? <p className={styles.hint}>Siparişlerde iletişim bilgileriniz hazır gelsin diye.</p>}
      </div>

      <div className={styles.field}>
        <label htmlFor={`${id}-password`} className={styles.label}>
          Şifre
        </label>
        <div className={styles.passwordWrap}>
          <input
            id={`${id}-password`}
            type={showPassword ? "text" : "password"}
            className={styles.input}
            value={values.password}
            onChange={(e) => set("password", e.target.value)}
            autoComplete="new-password"
            {...aria("password")}
          />
          <button
            type="button"
            className={styles.reveal}
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-controls={`${id}-password`}
          >
            {showPassword ? "Gizle" : "Göster"}
          </button>
        </div>
        {err("password") ?? <p className={styles.hint}>En az 8 karakter; en az bir harf ve bir rakam.</p>}
      </div>

      <div className={styles.field}>
        <label className={styles.check} htmlFor={`${id}-acceptTerms`}>
          <input
            id={`${id}-acceptTerms`}
            type="checkbox"
            checked={values.acceptTerms}
            onChange={(e) => set("acceptTerms", e.target.checked)}
            {...aria("acceptTerms")}
          />
          <span>
            <Link href="/kullanim-kosullari" target="_blank">
              Kullanım Koşulları
            </Link>
            &apos;nı kabul ediyorum;{" "}
            <Link href="/kvkk" target="_blank">
              KVKK Aydınlatma Metni
            </Link>
            &apos;ni okudum.
          </span>
        </label>
        {err("acceptTerms")}
      </div>

      {formError && (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      )}

      <button type="submit" className={styles.submit} disabled={loading}>
        {loading ? "Hesabınız açılıyor…" : "Üye Ol"}
      </button>

      <div className={styles.below}>
        <span>
          Zaten üye misiniz?{" "}
          <Link href={`/giris${next !== "/hesabim" ? `?next=${encodeURIComponent(next)}` : ""}`} className={styles.textLink}>
            Giriş yapın
          </Link>
        </span>
      </div>
    </form>
  );
}
