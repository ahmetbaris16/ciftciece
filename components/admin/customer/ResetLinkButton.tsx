"use client";

/**
 * Üyeye şifre yenileme bağlantısı gönderir (müşteri giriş yapamadığında). Bağlantı müşterinin e-postasına gider,
 * yeni şifreyi müşteri belirler; yönetici şifreyi görmez.
 */

import { useAdminRequest } from "@/components/admin/order/useAdminRequest";
import f from "@/components/admin/order/forms.module.css";

export default function ResetLinkButton({ userId, email }: { userId: string; email: string }) {
  const { busy, error, done, send } = useAdminRequest();

  const submit = () => {
    const question =
      `Şifre yenileme bağlantısı ${email} adresine gönderilsin mi?\n\n` +
      "Bağlantı 60 dakika geçerlidir; yeni şifreyi müşteri belirler. Daha önce gönderilmiş bağlantı geçersiz olur.";
    if (!window.confirm(question)) return;
    void send(`/api/admin/customers/${userId}/password-reset`, {}, {
      success: (result) =>
        (result as { mode?: string } | null)?.mode === "dev-outbox"
          ? "Geliştirme kipinde: e-posta gönderilmedi, .mock-data/outbox.json'a yazıldı (canlıda müşteriye gider)."
          : `Bağlantı ${email} adresine gönderildi.`,
    });
  };

  return (
    <div className={f.form}>
      <div className={f.actions}>
        <button type="button" className={f.secondary} disabled={busy} onClick={submit}>
          {busy ? "Gönderiliyor…" : "Şifre yenileme bağlantısı gönder"}
        </button>
      </div>
      {error && <p className={f.error}>{error}</p>}
      {done && <p className={f.ok}>{done}</p>}
    </div>
  );
}
