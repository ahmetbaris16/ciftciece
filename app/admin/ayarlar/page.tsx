/**
 * Admin Ayarlar Sayfası
 *
 * İşletme bilgileri, kargo ve ödeme ayarları DB'den (site_settings) düzenlenir.
 * Çalışma saatleri ve harita konumu lib/config/store.ts'tedir.
 */

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
import { ADMIN_PASSWORD_RULE, USERNAME_RULE, getAdminAccount } from "@/lib/auth/admin-account";
import { USE_DB } from "@/lib/data/source";

export default async function AdminAyarlarPage() {
  const user = await requireAdmin();
  const [shippingSettings, paymentSettings, business, account] = await Promise.all([
    getShippingSettings(),
    getPaymentSettings(),
    getBusinessInfo(),
    USE_DB ? getAdminAccount(user.id) : Promise.resolve(null),
  ]);

  return (
    <AdminShell user={user} activeSection="ayarlar">
      <div style={{ padding: "2rem", maxWidth: "900px" }}>
        <h1 style={styles.heading}>Ayarlar</h1>
        <p style={styles.subheading}>
          İşletme bilgileri, kargo, ödeme ve yönetici hesabınız. Değişiklikler siteye hemen yansır.
        </p>

        {/* İşletme (satıcı) bilgileri — DB'den düzenlenebilir */}
        <section style={styles.section} id="isletme">
          <h2 style={styles.sectionTitle}>🏪 İşletme Bilgileri</h2>
          <BusinessInfoForm initial={business} />
        </section>

        {/* Kargo — DB'den düzenlenebilir */}
        <section style={styles.section} id="kargo">
          <h2 style={styles.sectionTitle}>📦 Kargo</h2>
          <ShippingSettingsForm initial={shippingSettings} />
        </section>

        {/* Ödeme */}
        <section style={styles.section} id="odeme">
          <h2 style={styles.sectionTitle}>💳 Ödeme</h2>
          <PaymentSettingsForm initial={paymentSettings} provider={paymentProviderStatus()} />
        </section>

        {/* Yönetici hesabı — kullanıcı adı, e-posta, şifre */}
        <section style={styles.section} id="hesap">
          <h2 style={styles.sectionTitle}>👤 Yönetici Hesabı</h2>
          {account ? (
            <AdminAccountForm initial={account} usernameRule={USERNAME_RULE} passwordRule={ADMIN_PASSWORD_RULE} />
          ) : (
            <p style={styles.subheading}>
              {USE_DB ? "Hesap bilgileri okunamadı." : "Veritabanısız deneme kipinde hesap bilgileri değiştirilemez."}
            </p>
          )}
        </section>

        {/* Sistem */}
        <section style={styles.section} id="sistem">
          <h2 style={styles.sectionTitle}>🔧 Sistem</h2>
          <div style={styles.grid}>
            <InfoRow label="Ortam" value={process.env.NODE_ENV ?? "development"} />
            <InfoRow label="Veritabanı" value={process.env.DATABASE_URL ? "Bağlı" : "Bağlı değil (Mock mod)"} isTodo={!process.env.DATABASE_URL} />
            <InfoRow label="Oturum anahtarı" value={process.env.NEXTAUTH_SECRET ? "Yapılandırıldı" : "Eksik"} isTodo={!process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET.includes("TODO")} />
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function InfoRow({
  label,
  value,
  isTodo = false,
}: {
  label: string;
  value: string;
  isTodo?: boolean;
}) {
  return (
    <div style={styles.row}>
      <dt style={styles.rowLabel}>{label}</dt>
      <dd
        style={{
          ...styles.rowValue,
          ...(isTodo ? styles.rowTodo : {}),
        }}
      >
        {value}
        {isTodo && <span style={styles.todoBadge}>TODO</span>}
      </dd>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  heading: {
    fontSize: "1.75rem",
    fontWeight: 700,
    color: "#e8e4d9",
    margin: 0,
  },
  subheading: {
    fontSize: "0.9375rem",
    color: "rgba(232,228,217,0.5)",
    margin: "0.25rem 0 2rem",
  },
  section: {
    marginBottom: "2rem",
    padding: "1.5rem",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "12px",
  },
  sectionTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#e8e4d9",
    margin: "0 0 1.25rem",
    paddingBottom: "0.75rem",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  grid: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.625rem 0",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
  },
  rowLabel: {
    fontSize: "0.875rem",
    color: "rgba(232,228,217,0.5)",
    fontWeight: 400,
  },
  rowValue: {
    fontSize: "0.875rem",
    fontWeight: 500,
    color: "#e8e4d9",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  rowTodo: {
    color: "rgba(232,228,217,0.35)",
  },
  todoBadge: {
    fontSize: "0.625rem",
    fontWeight: 600,
    color: "#fbbf24",
    background: "rgba(251,191,36,0.15)",
    padding: "0.1rem 0.4rem",
    borderRadius: "4px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
};
