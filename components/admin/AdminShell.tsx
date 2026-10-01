"use client";

/**
 * Admin Shell — Sidebar Navigation + Content Area
 *
 * Tüm admin sayfalarında wrapper olarak kullanılır.
 */

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { SessionUser } from "@/lib/auth/session";

interface AdminShellProps {
  user: SessionUser;
  activeSection: string;
  children: ReactNode;
}

const NAV_ITEMS = [
  { key: "dashboard", label: "Panel", href: "/admin", icon: "📊" },
  { key: "urunler", label: "Ürünler", href: "/admin/urunler", icon: "📦" },
  { key: "siparisler", label: "Siparişler", href: "/admin/siparisler", icon: "🛒" },
  { key: "yorumlar", label: "Yorumlar", href: "/admin/yorumlar", icon: "⭐" },
  { key: "ayarlar", label: "Ayarlar", href: "/admin/ayarlar", icon: "⚙️" },
];

export default function AdminShell({ user, activeSection, children }: AdminShellProps) {
  const router = useRouter();
  return (
    <div style={styles.layout}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <Link href="/admin" style={styles.brand}>
            <span style={{ fontSize: "1.5rem" }}>🫒</span>
            <span style={styles.brandText}>Çiftçi Ece</span>
          </Link>
          <span style={styles.badge}>Admin</span>
        </div>

        <nav style={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              style={{
                ...styles.navItem,
                ...(activeSection === item.key ? styles.navItemActive : {}),
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.userInfo}>
            <span style={styles.userEmail}>{user.email}</span>
          </div>
          <button
            // NEXTAUTH_URL sitenin açıldığı adresten farklıysa callbackUrl yanlış porta gider; yönlendirme burada
            onClick={() =>
              void signOut({ redirect: false }).finally(() => {
                router.push("/admin/giris");
                router.refresh();
              })
            }
            style={styles.logoutBtn}
          >
            Çıkış Yap
          </button>
          <Link href="/" style={styles.siteLink}>
            ← Siteye Dön
          </Link>
        </div>
      </aside>

      {/* Content */}
      <main style={styles.main}>
        {children}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: "flex",
    minHeight: "100vh",
    background: "#141812",
    color: "#e8e4d9",
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  sidebar: {
    width: "260px",
    flexShrink: 0,
    background: "rgba(255,255,255,0.03)",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    flexDirection: "column" as const,
    position: "sticky" as const,
    top: 0,
    height: "100vh",
    overflowY: "auto" as const,
  },
  sidebarHeader: {
    padding: "1.5rem 1.25rem 1rem",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    textDecoration: "none",
  },
  brandText: {
    fontSize: "1rem",
    fontWeight: 700,
    color: "#e8e4d9",
  },
  badge: {
    fontSize: "0.6875rem",
    fontWeight: 600,
    color: "#8fa34e",
    background: "rgba(143,163,78,0.15)",
    padding: "0.125rem 0.5rem",
    borderRadius: "4px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  nav: {
    flex: 1,
    padding: "0.75rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.25rem",
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.625rem 0.875rem",
    borderRadius: "8px",
    textDecoration: "none",
    color: "rgba(232,228,217,0.6)",
    fontSize: "0.875rem",
    fontWeight: 500,
    transition: "background 0.15s, color 0.15s",
  },
  navItemActive: {
    background: "rgba(143,163,78,0.15)",
    color: "#c4d68e",
  },
  sidebarFooter: {
    padding: "1rem 1.25rem",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.5rem",
  },
  userInfo: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  userEmail: {
    fontSize: "0.75rem",
    color: "rgba(232,228,217,0.4)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  logoutBtn: {
    padding: "0.5rem 0.75rem",
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.2)",
    borderRadius: "6px",
    color: "#fca5a5",
    fontSize: "0.8125rem",
    cursor: "pointer",
    transition: "background 0.15s",
  },
  siteLink: {
    fontSize: "0.8125rem",
    color: "rgba(232,228,217,0.4)",
    textDecoration: "none",
    textAlign: "center" as const,
  },
};
