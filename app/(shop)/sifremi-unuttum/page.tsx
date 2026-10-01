/**
 * Şifremi Unuttum — /sifremi-unuttum
 * E-posta gönderimi yapılandırılmamışsa (canlıda RESEND_API_KEY/EMAIL_FROM yok) form yerine
 * WhatsApp/telefon yolu gösterilir; "gönderdik" deyip hiçbir şey göndermemek yok.
 */

import type { Metadata } from "next";
import AuthShell from "@/components/account/AuthShell";
import { ForgotPasswordForm } from "@/components/account/PasswordResetForms";
import { emailDelivery } from "@/lib/email/mailer";
import { STORE } from "@/lib/config/store";
import { ACCOUNT_MESSAGES } from "@/lib/validation/account";
import styles from "@/components/account/Auth.module.css";

export const metadata: Metadata = {
  title: "Şifremi Unuttum",
  description: "Çiftçi Ece üyelik şifrenizi e-postanıza gelen bağlantıyla yenileyin.",
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

export default function SifremiUnuttumPage() {
  const delivery = emailDelivery();
  const whatsapp = `https://wa.me/${STORE.contact.whatsapp}?text=${encodeURIComponent(
    "Merhaba, Çiftçi Ece sitesindeki üyeliğimin şifresini unuttum. Yardımcı olabilir misiniz?"
  )}`;

  return (
    <AuthShell
      mode="sifre"
      next="/hesabim"
      title="Şifrenizi mi unuttunuz?"
      lead="Üyelik e-posta adresinizi yazın; şifrenizi yenilemeniz için bir bağlantı gönderelim."
    >
      {delivery === "none" ? (
        <p className={styles.formNotice}>
          {ACCOUNT_MESSAGES.resetUnavailable}{" "}
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={styles.textLink}>
            WhatsApp&apos;tan yazın
          </a>{" "}
          ya da{" "}
          <a href={`tel:${STORE.contact.phone}`} className={styles.textLink}>
            {STORE.contact.phoneFormatted}
          </a>
          .
        </p>
      ) : (
        <ForgotPasswordForm devOutbox={delivery === "dev-outbox"} />
      )}
    </AuthShell>
  );
}
