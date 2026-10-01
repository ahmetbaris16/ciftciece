/**
 * Üye Ol — /uye-ol?next=/...
 * Zaten giriş yapmış müşteri doğrudan hedef sayfaya gönderilir.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthShell from "@/components/account/AuthShell";
import RegisterForm from "@/components/account/RegisterForm";
import { getCurrentCustomer } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/validation/account";

export const metadata: Metadata = {
  title: "Üye Ol",
  description: "Çiftçi Ece'ye üye olun: siparişlerinizi takip edin, ürünleri değerlendirin, daha hızlı ödeme yapın.",
  robots: { index: false, follow: true },
};

interface Props {
  searchParams: Promise<{ next?: string | string[] }>;
}

export default async function UyeOlPage({ searchParams }: Props) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(Array.isArray(rawNext) ? rawNext[0] : rawNext);

  if (await getCurrentCustomer()) redirect(next);

  return (
    <AuthShell
      mode="uye-ol"
      next={next}
      title="Üyelik oluşturun"
      lead="Bir dakikanızı alır. Bilgileriniz yalnızca siparişleriniz ve hesabınız için kullanılır."
    >
      <RegisterForm next={next} />
    </AuthShell>
  );
}
