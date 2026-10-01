"use client";

/**
 * Admin Login Form
 *
 * useSearchParams kullanan client component.
 * Suspense boundary ile sarılarak page.tsx'den çağrılır.
 */

import { signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState(error ? "Geçersiz e-posta veya şifre" : "");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setLoginError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        // "RATE_LIMITED": lib/auth/auth-options.ts → LOGIN_RATE_LIMITED
        setLoginError(
          result.error === "RATE_LIMITED"
            ? "Çok fazla deneme yapıldı. 15 dakika sonra tekrar deneyin."
            : "Geçersiz e-posta veya şifre"
        );
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
      {loginError && (
        <div style={styles.error}>
          {loginError}
        </div>
      )}

      <div style={styles.field}>
        <label htmlFor="admin-email" style={styles.label}>
          E-posta
        </label>
        <input
          id="admin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="email"
          style={styles.input}
          placeholder="admin@ciftciece.com"
        />
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
          placeholder="••••••••"
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
  input: {
    padding: "0.75rem 1rem",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "8px",
    color: "#e8e4d9",
    fontSize: "0.9375rem",
    outline: "none",
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
