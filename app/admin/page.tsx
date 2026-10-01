/**
 * Admin Dashboard
 *
 * Ana panel — özet kartlar ve hızlı işlemler.
 * Auth kontrolü server-side yapılır.
 */

import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/AdminShell";

export default async function AdminDashboardPage() {
  const user = await requireAdmin();

  return (
    <AdminShell user={user} activeSection="dashboard">
      <div style={{ padding: "2rem" }}>
        <h1 style={styles.heading}>Hoş geldiniz, {user.name || user.email}</h1>
        <p style={styles.subheading}>Çiftçi Ece Yönetim Paneli</p>

        <div style={styles.grid}>
          <DashboardCard
            title="Ürünler"
            description="Ürün, varyant ve stok yönetimi"
            href="/admin/urunler"
            icon="📦"
          />
          <DashboardCard
            title="Siparişler"
            description="Sipariş takibi ve durum güncelleme"
            href="/admin/siparisler"
            icon="🛒"
          />
          <DashboardCard
            title="Yorumlar"
            description="Müşteri yorumlarını yönet"
            href="/admin/yorumlar"
            icon="⭐"
          />
          <DashboardCard
            title="Ayarlar"
            description="Mağaza ayarları ve site konfigürasyonu"
            href="/admin/ayarlar"
            icon="⚙️"
          />
        </div>
      </div>
    </AdminShell>
  );
}

function DashboardCard({
  title,
  description,
  href,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: string;
}) {
  return (
    <a href={href} style={styles.card}>
      <span style={styles.cardIcon}>{icon}</span>
      <h2 style={styles.cardTitle}>{title}</h2>
      <p style={styles.cardDesc}>{description}</p>
    </a>
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
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: "1.25rem",
  },
  card: {
    display: "flex",
    flexDirection: "column" as const,
    padding: "1.5rem",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    textDecoration: "none",
    transition: "background 0.2s, border-color 0.2s",
    cursor: "pointer",
  },
  cardIcon: {
    fontSize: "2rem",
    marginBottom: "0.75rem",
  },
  cardTitle: {
    fontSize: "1.125rem",
    fontWeight: 600,
    color: "#e8e4d9",
    margin: "0 0 0.25rem",
  },
  cardDesc: {
    fontSize: "0.8125rem",
    color: "rgba(232,228,217,0.5)",
    margin: 0,
    lineHeight: 1.5,
  },
};
