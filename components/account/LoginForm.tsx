"use client";

/**
 * Üye girişi — NextAuth "customer" sağlayıcısı (yalnız müşteri hesapları; yönetici girişi /admin/giris).
 * Girişten sonra ?next= ile gelinen sayfaya (yalnız site içi yol) döner.
 */

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ACCOUNT_MESSAGES, normalizeEmail } from "@/lib/validation/account";
import styles from "./Auth.module.css";

const RATE_LIMITED = "RATE_LIMITED"; // lib/auth/auth-options.ts → LOGIN_RATE_LIMITED

export default function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const id = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("E-posta adresinizi ve şifrenizi girin.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await signIn("customer", {
        email: normalizeEmail(email),
        password,
        redirect: false,
      });
      if (!res || res.error) {
        setError(res?.error === RATE_LIMITED ? ACCOUNT_MESSAGES.tooMany : ACCOUNT_MESSAGES.loginFailed);
        setLoading(false);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError(ACCOUNT_MESSAGES.unavailable);
      setLoading(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label htmlFor={`${id}-email`} className={styles.label}>
          E-posta
        </label>
        <input
          id={`${id}-email`}
          type="email"
          className={styles.input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          placeholder="ornek@eposta.com"
          aria-invalid={!!error || undefined}
          required
        />
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            aria-invalid={!!error || undefined}
            required
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
      </div>

      <Link href="/sifremi-unuttum" className={styles.forgot}>
        Şifremi unuttum
      </Link>

      {error && (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      )}

      <button type="submit" className={styles.submit} disabled={loading}>
        {loading ? "Giriş yapılıyor…" : "Giriş Yap"}
      </button>

      <div className={styles.below}>
        <span>
          Hesabınız yok mu?{" "}
          <Link href={`/uye-ol${next !== "/hesabim" ? `?next=${encodeURIComponent(next)}` : ""}`} className={styles.textLink}>
            Hemen üye olun
          </Link>
        </span>
        <span>
          Üye olmadan sipariş verdiniz mi?{" "}
          <Link href="/siparis-takip" className={styles.textLink}>
            Siparişinizi takip edin
          </Link>
        </span>
      </div>
    </form>
  );
}
