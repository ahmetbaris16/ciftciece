"use client";

/**
 * Admin — Yönetici hesabı: kullanıcı adı, e-posta ve şifre. Her değişiklik için mevcut şifre istenir.
 * Şifre değişince bu oturum kapanır ve yeni şifreyle giriş istenir (başka cihazlardaki oturumlar da düşer).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

export default function AdminAccountForm({
  initial,
  usernameRule,
  passwordRule,
}: {
  initial: { username: string | null; email: string };
  usernameRule: string;
  passwordRule: string;
}) {
  const router = useRouter();
  const [username, setUsername] = useState(initial.username ?? "");
  const [email, setEmail] = useState(initial.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setStatus(null);
    const err = (text: string) => setStatus({ kind: "error", text });
    if (!username.trim()) return err("Kullanıcı adı yazın.");
    if (newPassword && newPassword !== newPassword2) return err("Yeni şifre ile tekrarı aynı değil.");
    if (!currentPassword) return err("Değişikliği onaylamak için mevcut şifrenizi yazın.");

    setSaving(true);
    try {
      const res = await fetch("/api/admin/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          username: username.trim(),
          email: email.trim(),
          ...(newPassword ? { newPassword } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSaving(false);
        return err(data?.error ?? "Kaydedilemedi.");
      }
      if (data?.result?.passwordChanged) {
        // Yeni şifreyle giriş: eski oturum kapanır (NEXTAUTH_URL farklı portta olabilir → yönlendirme burada)
        void signOut({ redirect: false }).finally(() => {
          router.push("/admin/giris?sifre=degisti");
          router.refresh();
        });
        return;
      }
      setCurrentPassword("");
      setUsername(data?.result?.username ?? username.trim().toLowerCase());
      setEmail(data?.result?.email ?? email.trim().toLowerCase());
      setStatus({ kind: "ok", text: "Hesap bilgileri kaydedildi. Bir sonraki girişte kullanıcı adınızı yazabilirsiniz." });
      setSaving(false);
      router.refresh();
    } catch {
      setSaving(false);
      err("Bağlantı hatası. Tekrar deneyin.");
    }
  };

  return (
    <div style={s.wrap}>
      {!initial.username && (
        <p style={s.notice}>
          Henüz kullanıcı adınız yok. Bir kullanıcı adı belirleyin; girişte e-posta yerine onu yazarsınız.
        </p>
      )}
      <div style={s.grid}>
        <label style={s.field}>
          <span style={s.label}>Kullanıcı adı</span>
          <input
            style={s.input}
            value={username}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={40}
            onChange={(e) => setUsername(e.target.value)}
          />
          <span style={s.hint}>{usernameRule}.</span>
        </label>
        <label style={s.field}>
          <span style={s.label}>E-posta</span>
          <input style={s.input} type="email" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
          <span style={s.hint}>Girişte kullanıcı adı yerine de yazılabilir.</span>
        </label>
        <label style={s.field}>
          <span style={s.label}>Yeni şifre (değiştirmeyecekseniz boş bırakın)</span>
          <input
            style={s.input}
            type="password"
            value={newPassword}
            autoComplete="new-password"
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <span style={s.hint}>{passwordRule.charAt(0).toUpperCase() + passwordRule.slice(1)}.</span>
        </label>
        <label style={s.field}>
          <span style={s.label}>Yeni şifre (tekrar)</span>
          <input
            style={s.input}
            type="password"
            value={newPassword2}
            autoComplete="new-password"
            onChange={(e) => setNewPassword2(e.target.value)}
            disabled={!newPassword}
          />
        </label>
      </div>
      <label style={{ ...s.field, maxWidth: 360 }}>
        <span style={s.label}>Mevcut şifreniz (onay için)</span>
        <input
          style={s.input}
          type="password"
          value={currentPassword}
          autoComplete="current-password"
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </label>
      <div style={s.footer}>
        <button type="button" style={s.primaryBtn} onClick={save} disabled={saving}>
          {saving ? "Kaydediliyor…" : "Hesabı kaydet"}
        </button>
        {status && (
          <span role="status" style={{ color: status.kind === "ok" ? "#9fd39f" : "#f3a0a0", fontSize: "0.875rem" }}>
            {status.text}
          </span>
        )}
      </div>
    </div>
  );
}

const s = {
  wrap: { display: "flex", flexDirection: "column", gap: "1rem" },
  notice: {
    margin: 0,
    padding: "0.625rem 0.75rem",
    borderRadius: 6,
    background: "rgba(232,192,122,0.08)",
    border: "1px solid rgba(232,192,122,0.2)",
    color: "#e8c07a",
    fontSize: "0.8125rem",
    lineHeight: 1.5,
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.875rem" },
  field: { display: "flex", flexDirection: "column", gap: "0.375rem", minWidth: 0 },
  label: { fontSize: "0.8125rem", color: "rgba(232,228,217,0.7)" },
  hint: { fontSize: "0.75rem", color: "rgba(232,228,217,0.45)", lineHeight: 1.45 },
  input: {
    padding: "0.5rem 0.625rem",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    color: "#e8e4d9",
    fontSize: "0.875rem",
    minWidth: 0,
  },
  footer: { display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" },
  primaryBtn: {
    padding: "0.625rem 1.25rem",
    background: "#c4d68e",
    color: "#15180f",
    border: 0,
    borderRadius: 8,
    fontWeight: 600,
    fontSize: "0.875rem",
  },
} satisfies Record<string, React.CSSProperties>;
