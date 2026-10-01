/**
 * Üye Girişi — /giris?next=/...
 * Zaten giriş yapmış müşteri doğrudan hedef sayfaya gönderilir.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthShell from "@/components/account/AuthShell";
import LoginForm from "@/components/account/LoginForm";
import { getCurrentCustomer } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/validation/account";

export const metadata: Metadata = {
  title: "Giriş Yap",
  description: "Çiftçi Ece üyeliğinize giriş yapın: siparişleriniz, değerlendirmeleriniz ve hesap bilgileriniz.",
  robots: { index: false, follow: true },
};

interface Props {
  searchParams: Promise<{ next?: string | string[]; sifre?: string | string[] }>;
}

export default async function GirisPage({ searchParams }: Props) {
  const { next: rawNext, sifre } = await searchParams;
  const passwordReset = (Array.isArray(sifre) ? sifre[0] : sifre) === "yenilendi";
  const next = safeNextPath(Array.isArray(rawNext) ? rawNext[0] : rawNext);

  if (await getCurrentCustomer()) redirect(next);

  return (
    <AuthShell
      mode="giris"
      next={next}
      title="Tekrar hoş geldiniz"
      lead={
        passwordReset
          ? "Şifreniz yenilendi. Yeni şifrenizle giriş yapın."
          : "E-posta adresiniz ve şifrenizle giriş yapın."
      }
    >
      <LoginForm next={next} />
    </AuthShell>
  );
}
