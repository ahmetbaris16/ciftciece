/**
 * Admin Ayarlar Sayfası
 *
 * Mağaza konfigürasyonu, iletişim bilgileri ve genel ayarlar.
 * Kargo ve ödeme ayarları DB'den (site_settings) düzenlenir; diğer bölümler lib/config/store.ts'ten okunur.
 */

import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/AdminShell";
import { STORE } from "@/lib/config/store";
import ShippingSettingsForm from "@/components/admin/ShippingSettingsForm";
import { getShippingSettings } from "@/lib/shipping/shipping.repository";
import PaymentSettingsForm from "@/components/admin/PaymentSettingsForm";
import { getPaymentSettings } from "@/lib/payment/settings.repository";
import { paymentProviderStatus } from "@/lib/payment/provider";

export default async function AdminAyarlarPage() {
  const user = await requireAdmin();
  const [shippingSettings, paymentSettings] = await Promise.all([getShippingSettings(), getPaymentSettings()]);

  return (
    <AdminShell user={user} activeSection="ayarlar">
      <div style={{ padding: "2rem", maxWidth: "900px" }}>
        <h1 style={styles.heading}>Ayarlar</h1>
        <p style={styles.subheading}>
          Mağaza bilgileri ve site konfigürasyonu
        </p>

        {/* Mağaza Bilgileri */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>🏪 Mağaza Bilgileri</h2>
          <div style={styles.grid}>
            <InfoRow label="Mağaza Adı" value={STORE.name} />
            <InfoRow label="Slogan" value={STORE.tagline} />
            <InfoRow label="Yasal Ad" value={STORE.legalName} />
          </div>
        </section>

        {/* İletişim */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>📞 İletişim</h2>
          <div style={styles.grid}>
            <InfoRow label="Telefon" value={STORE.contact.phoneFormatted} />
            <InfoRow label="E-posta" value={STORE.contact.email} isTodo={STORE.contact.email === "TODO"} />
            <InfoRow label="WhatsApp" value={STORE.contact.whatsapp} />
            <InfoRow label="Instagram" value={STORE.contact.instagram} isTodo={String(STORE.contact.instagram) === "TODO"} />
          </div>
        </section>

        {/* Adres */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>📍 Adres</h2>
          <div style={styles.grid}>
            <InfoRow label="Tam Adres" value={STORE.address.full} />
            <InfoRow label="İlçe / Şehir" value={`${STORE.address.district} / ${STORE.address.city}`} />
            <InfoRow label="Koordinat" value={`${STORE.address.lat}, ${STORE.address.lng}`} />
          </div>
        </section>

        {/* Kargo — DB'den düzenlenebilir */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>📦 Kargo</h2>
          <ShippingSettingsForm initial={shippingSettings} />
        </section>

        {/* Ödeme */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>💳 Ödeme</h2>
          <PaymentSettingsForm initial={paymentSettings} provider={paymentProviderStatus()} />
        </section>

        {/* Yasal */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>📋 Yasal Bilgiler</h2>
          <div style={styles.grid}>
            <InfoRow label="Vergi No" value={STORE.legal.taxNumber} isTodo={STORE.legal.taxNumber === "TODO"} />
            <InfoRow label="MERSIS No" value={STORE.legal.mersisNo} isTodo={STORE.legal.mersisNo === "TODO"} />
          </div>
        </section>

        {/* Environment */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>🔧 Sistem</h2>
          <div style={styles.grid}>
            <InfoRow label="Ortam" value={process.env.NODE_ENV ?? "development"} />
            <InfoRow label="Veritabanı" value={process.env.DATABASE_URL ? "Bağlı" : "Bağlı değil (Mock mod)"} isTodo={!process.env.DATABASE_URL} />
            <InfoRow label="NextAuth" value={process.env.NEXTAUTH_SECRET ? "Yapılandırıldı" : "Eksik"} isTodo={!process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET.includes("TODO")} />
          </div>
        </section>

        {/* TODO Notice */}
        <div style={styles.notice}>
          <strong>💡 Not:</strong> &quot;TODO&quot; olarak işaretli alanlar henüz
          yapılandırılmamış. Bu bilgileri <code>.env</code> dosyasından veya{" "}
          <code>lib/config/store.ts</code> dosyasından güncelleyebilirsiniz.
        </div>
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
  notice: {
    padding: "1rem 1.25rem",
    background: "rgba(251,191,36,0.08)",
    border: "1px solid rgba(251,191,36,0.15)",
    borderRadius: "10px",
    fontSize: "0.85rem",
    color: "rgba(232,228,217,0.7)",
    lineHeight: 1.6,
  },
};
