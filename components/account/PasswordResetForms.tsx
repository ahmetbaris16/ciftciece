"use client";

/**
 * "Şifremi unuttum" formları:
 *  - ForgotPasswordForm: e-posta → bağlantı gönderilir (hesap var/yok aynı mesaj)
 *  - ResetPasswordForm: bağlantıdaki token + yeni şifre → giriş sayfasına döner
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ACCOUNT_MESSAGES, PasswordResetSchema, accountFieldErrors, normalizeEmail } from "@/lib/validation/account";
import styles from "./Auth.module.css";

export function ForgotPasswordForm({ devOutbox }: { devOutbox: boolean }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError(ACCOUNT_MESSAGES.email);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizeEmail(email) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? ACCOUNT_MESSAGES.unavailable);
        return;
      }
      setSent(data?.message ?? ACCOUNT_MESSAGES.resetRequested);
    } catch {
      setError(ACCOUNT_MESSAGES.unavailable);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className={styles.form}>
        <p className={styles.formSuccess} role="status">
          {sent}
        </p>
        {devOutbox && (
          <p className={styles.formNotice}>
            Geliştirme modu: e-posta gönderilmedi, <code>.mock-data/outbox.json</code> dosyasına yazıldı.
          </p>
        )}
        <div className={styles.below}>
          <span>
            E-posta gelmedi mi?{" "}
            <button type="button" className={styles.forgot} onClick={() => setSent(null)}>
              Tekrar gönder
            </button>
          </span>
          <span>
            <Link href="/giris" className={styles.textLink}>
              Giriş sayfasına dön
            </Link>
          </span>
        </div>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label htmlFor={`${id}-email`} className={styles.label}>
          Üyelik e-posta adresiniz
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
      {error && (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className={styles.submit} disabled={loading}>
        {loading ? "Gönderiliyor…" : "Yenileme bağlantısı gönder"}
      </button>
      <div className={styles.below}>
        <span>
          Şifrenizi hatırladınız mı?{" "}
          <Link href="/giris" className={styles.textLink}>
            Giriş yapın
          </Link>
        </span>
      </div>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const id = useId();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = PasswordResetSchema.safeParse({ token, newPassword: password });
    if (!parsed.success) {
      setError(accountFieldErrors(parsed.error).message);
      return;
    }
    if (password !== confirm) {
      setError("Şifreler aynı değil.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/account/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (data?.code === "INVALID_TOKEN") setExpired(true);
        setError(data?.error ?? ACCOUNT_MESSAGES.unavailable);
        setLoading(false);
        return;
      }
      router.replace("/giris?sifre=yenilendi");
    } catch {
      setError(ACCOUNT_MESSAGES.unavailable);
      setLoading(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label htmlFor={`${id}-pw`} className={styles.label}>
          Yeni şifre
        </label>
        <div className={styles.passwordWrap}>
          <input
            id={`${id}-pw`}
            type={show ? "text" : "password"}
            className={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            aria-describedby={`${id}-pw-hint`}
            required
          />
          <button
            type="button"
            className={styles.reveal}
            onClick={() => setShow((v) => !v)}
            aria-pressed={show}
            aria-controls={`${id}-pw`}
          >
            {show ? "Gizle" : "Göster"}
          </button>
        </div>
        <p id={`${id}-pw-hint`} className={styles.hint}>
          En az 8 karakter; en az bir harf ve bir rakam.
        </p>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-pw2`} className={styles.label}>
          Yeni şifre (tekrar)
        </label>
        <input
          id={`${id}-pw2`}
          type={show ? "text" : "password"}
          className={styles.input}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      {error && (
        <p className={styles.formError} role="alert">
          {error}{" "}
          {expired && (
            <Link href="/sifremi-unuttum" className={styles.textLink}>
              Yeni bağlantı iste
            </Link>
          )}
        </p>
      )}
      <button type="submit" className={styles.submit} disabled={loading}>
        {loading ? "Kaydediliyor…" : "Şifremi yenile"}
      </button>
    </form>
  );
}
