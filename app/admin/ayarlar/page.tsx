/**
 * Admin — Ayarlar: işletme bilgileri, kargo ücreti, ödeme yöntemleri, e-posta durumu ve yönetici hesabı.
 * Bilgiler DB'den (site_settings) düzenlenir; çalışma saatleri ve harita konumu lib/config/store.ts'tedir.
 */

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/AdminShell";
import ShippingSettingsForm from "@/components/admin/ShippingSettingsForm";
import { getShippingSettings } from "@/lib/shipping/shipping.repository";
import PaymentSettingsForm from "@/components/admin/PaymentSettingsForm";
import { getPaymentSettings } from "@/lib/payment/settings.repository";
import { paymentProviderStatus } from "@/lib/payment/provider";
import BusinessInfoForm from "@/components/admin/BusinessInfoForm";
import { getBusinessInfo } from "@/lib/business/business.repository";
import AdminAccountForm from "@/components/admin/AdminAccountForm";
import EmailTools from "@/components/admin/EmailTools";
import { ADMIN_PASSWORD_RULE, USERNAME_RULE, getAdminAccount } from "@/lib/auth/admin-account";
import { emailMode } from "@/lib/email/config";
import { getLaunchChecklist, type CheckState } from "@/lib/admin/dashboard";
import { USE_DB } from "@/lib/data/source";
import st from "./settings.module.css";

export const dynamic = "force-dynamic";

const EMAIL_STATE = {
  smtp: { ok: true, text: "E-posta gönderimi çalışıyor: sipariş e-postaları müşterilere ve size gidiyor." },
  "dev-outbox": { ok: false, text: "Yerel geliştirme kipi: e-postalar gönderilmez, .mock-data/outbox.json dosyasına yazılır." },
  none: {
    ok: false,
    text: "E-posta gönderimi ayarlı değil: sipariş e-postaları bekliyor, müşterilere gitmiyor. Hosting'de e-posta (SMTP) bilgileri girilince kendiliğinden gönderilir (docs/YAYIN.md).",
  },
} as const;

const CHECK_STATE: Record<CheckState, { label: string; className: string }> = {
  ok: { label: "Tamam", className: st.stateOk },
  todo: { label: "Yapılacak", className: st.stateTodo },
  manual: { label: "Elle kontrol", className: st.stateManual },
};

export default async function AdminAyarlarPage() {
  const user = await requireAdmin();
  const [shippingSettings, paymentSettings, business, account, checklist] = await Promise.all([
    getShippingSettings(),
    getPaymentSettings(),
    getBusinessInfo(),
    USE_DB ? getAdminAccount(user.id) : Promise.resolve(null),
    getLaunchChecklist(),
  ]);
  const openChecks = checklist.filter((c) => c.state !== "ok").length;
  const mail = EMAIL_STATE[emailMode()];

  return (
    <AdminShell user={user} activeSection="ayarlar">
      <div className={st.page}>
        <h1 className={st.h1}>Ayarlar</h1>
        <p className={st.sub}>Değişiklikler siteye hemen yansır.</p>

        <section className={st.card} id="isletme">
          <h2 className={st.h2}>İşletme bilgileri</h2>
          <p className={st.lead}>İletişim sayfasında, sözleşmelerde ve e-postalarda görünür.</p>
          <BusinessInfoForm initial={business} />
        </section>

        <section className={st.card} id="kargo">
          <h2 className={st.h2}>Kargo</h2>
          <ShippingSettingsForm initial={shippingSettings} />
        </section>

        <section className={st.card} id="odeme">
          <h2 className={st.h2}>Ödeme yöntemleri</h2>
          <PaymentSettingsForm initial={paymentSettings} provider={paymentProviderStatus()} />
        </section>

        <section className={st.card} id="eposta">
          <h2 className={st.h2}>E-posta</h2>
          <p className={mail.ok ? st.ok : st.warn}>{mail.text}</p>
          <EmailTools defaultTo={business.notificationEmail || business.email} showRun={false} />
          <Link href="/admin/epostalar" className={st.link}>
            Gönderilen e-postaları gör ›
          </Link>
        </section>

        <section className={st.card} id="hesap">
          <h2 className={st.h2}>Yönetici hesabı</h2>
          {account ? (
            <>
              <p className={st.lead}>
                Kullanıcı adı: <strong>{account.username ?? "—"}</strong> · E-posta: <strong>{account.email}</strong>
              </p>
              <details className={st.details} open={!account.username}>
                <summary>Kullanıcı adı, e-posta ya da şifreyi değiştir</summary>
                <div className={st.detailsBody}>
                  <AdminAccountForm initial={account} usernameRule={USERNAME_RULE} passwordRule={ADMIN_PASSWORD_RULE} />
                </div>
              </details>
            </>
          ) : (
            <p className={st.lead}>
              {USE_DB ? "Hesap bilgileri okunamadı." : "Veritabanısız deneme kipinde hesap bilgileri değiştirilemez."}
            </p>
          )}
        </section>

        <section className={st.card} id="yayin">
          <details className={st.details}>
            <summary>Yayın öncesi kontrol listesi{openChecks > 0 ? ` (${openChecks} madde açık)` : " (tamam)"}</summary>
            <ul className={st.checks}>
              {checklist.map((c) => (
                <li key={c.label} className={st.check}>
                  <span className={`${st.state} ${CHECK_STATE[c.state].className}`}>{CHECK_STATE[c.state].label}</span>
                  <span>
                    <strong>{c.label}</strong>
                    <span className={st.checkDetail}>{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      </div>
    </AdminShell>
  );
}
