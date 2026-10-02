"use client";

/**
 * Yönetici giriş formu: kullanıcı adı (ya da e-posta) + şifre.
 *
 * useSearchParams kullanan client component; page.tsx'te Suspense ile sarılır.
 * ?sifre=degisti → şifre panelden değiştirildi, yeni şifreyle giriş istenir.
 */

import { signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const WRONG = "Kullanıcı adı ya da şifre hatalı.";

export default function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const passwordChanged = searchParams.get("sifre") === "degisti";

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState(error ? WRONG : "");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setLoginError("");

    try {
      const result = await signIn("credentials", {
        login: login.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        // "RATE_LIMITED": lib/auth/auth-options.ts → LOGIN_RATE_LIMITED
        setLoginError(result.error === "RATE_LIMITED" ? "Çok fazla deneme yapıldı. 15 dakika sonra tekrar deneyin." : WRONG);
        setIsLoading(false);
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setLoginError("Bir hata oluştu. Tekrar deneyin.");
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      {passwordChanged && !loginError && (
        <div style={styles.info} role="status">
          Şifreniz değişti. Yeni şifrenizle giriş yapın.
        </div>
      )}
      {loginError && (
        <div style={styles.error} role="alert">
          {loginError}
        </div>
      )}

      <div style={styles.field}>
        <label htmlFor="admin-login" style={styles.label}>
          Kullanıcı adı
        </label>
        <input
          id="admin-login"
          type="text"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          required
          autoFocus
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          style={styles.input}
          aria-describedby="admin-login-hint"
        />
        <span id="admin-login-hint" style={styles.hint}>
          E-posta adresinizle de girebilirsiniz.
        </span>
      </div>

      <div style={styles.field}>
        <label htmlFor="admin-password" style={styles.label}>
          Şifre
        </label>
        <input
          id="admin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          style={styles.input}
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        style={{
          ...styles.button,
          opacity: isLoading ? 0.7 : 1,
          cursor: isLoading ? "not-allowed" : "pointer",
        }}
      >
        {isLoading ? "Giriş yapılıyor..." : "Giriş Yap"}
      </button>
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1.25rem",
  },
  error: {
    padding: "0.75rem 1rem",
    background: "rgba(239,68,68,0.15)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: "8px",
    color: "#fca5a5",
    fontSize: "0.875rem",
    textAlign: "center" as const,
  },
  info: {
    padding: "0.75rem 1rem",
    background: "rgba(159,211,159,0.12)",
    border: "1px solid rgba(159,211,159,0.3)",
    borderRadius: "8px",
    color: "#c8e6c8",
    fontSize: "0.875rem",
    textAlign: "center" as const,
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.375rem",
  },
  label: {
    fontSize: "0.8125rem",
    fontWeight: 500,
    color: "rgba(232,228,217,0.7)",
  },
  hint: {
    fontSize: "0.75rem",
    color: "rgba(232,228,217,0.45)",
  },
  input: {
    padding: "0.75rem 1rem",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "8px",
    color: "#e8e4d9",
    fontSize: "0.9375rem",
    transition: "border-color 0.2s",
  },
  button: {
    padding: "0.875rem",
    background: "linear-gradient(135deg, #6b7a3d 0%, #8fa34e 100%)",
    border: "none",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "0.9375rem",
    fontWeight: 600,
    marginTop: "0.5rem",
    transition: "opacity 0.2s",
  },
};
