/**
 * Yeni Şifre Belirleme — /sifre-sifirla?token=...
 * Bağlantı açılırken token kontrol edilir; geçersiz/süresi dolmuşsa form yerine yeni bağlantı isteme yolu.
 * Adres çubuğundaki token başka siteye Referer ile gitmesin diye referrer kapalı.
 */

import type { Metadata } from "next";
import Link from "next/link";
import AuthShell from "@/components/account/AuthShell";
import { ResetPasswordForm } from "@/components/account/PasswordResetForms";
import { isResetTokenValid } from "@/lib/account/password-reset";
import { ACCOUNT_MESSAGES } from "@/lib/validation/account";
import styles from "@/components/account/Auth.module.css";

export const metadata: Metadata = {
  title: "Yeni Şifre Belirle",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ token?: string | string[] }>;
}

export default async function SifreSifirlaPage({ searchParams }: Props) {
  const { token: raw } = await searchParams;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const valid = await isResetTokenValid(token).catch((err) => {
    console.error("[sifre-sifirla] token kontrolü:", err);
    return false;
  });

  return (
    <AuthShell
      mode="sifre"
      next="/hesabim"
      title="Yeni şifrenizi belirleyin"
      lead={
        valid
          ? "Yeni şifrenizi iki kez yazın. Kaydedince diğer cihazlardaki oturumlarınız kapanır."
          : "Bu bağlantıyla şifre yenilenemiyor."
      }
    >
      {valid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className={styles.form}>
          <p className={styles.formError} role="alert">
            {ACCOUNT_MESSAGES.resetLinkInvalid}
          </p>
          <Link href="/sifremi-unuttum" className={styles.submit} style={{ textAlign: "center", textDecoration: "none" }}>
            Yeni bağlantı iste
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
