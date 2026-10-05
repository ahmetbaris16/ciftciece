"use client";

/**
 * Admin iskeleti — yan menü (geniş ekran) / üst menü (telefon) + içerik.
 * Menüde bekleyen işler rozetle görünür (/api/admin/summary): kargolanacak siparişler, havale bekleyenler,
 * ödeme uyarısı, açık müşteri talepleri, okunmamış mesajlar, gönderilemeyen e-postalar, onay bekleyen yorumlar.
 */

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { SessionUser } from "@/lib/auth/session";
import type { AdminBadges } from "@/lib/admin/dashboard";
import styles from "./AdminShell.module.css";

interface AdminShellProps {
  user: SessionUser;
  activeSection: string;
  children: ReactNode;
}

type BadgeKey = (b: AdminBadges) => number;

const NAV_ITEMS: Array<{ key: string; label: string; href: string; icon: string; badge?: BadgeKey; urgent?: BadgeKey }> = [
  { key: "dashboard", label: "Panel", href: "/admin", icon: "📊" },
  {
    key: "siparisler",
    label: "Siparişler",
    href: "/admin/siparisler",
    icon: "🛒",
    badge: (b) => b.toShip + b.pendingTransfers + b.openRequests,
    urgent: (b) => b.attention,
  },
  { key: "urunler", label: "Ürünler", href: "/admin/urunler", icon: "📦" },
  { key: "musteriler", label: "Müşteriler", href: "/admin/musteriler", icon: "👥" },
  { key: "mesajlar", label: "Mesajlar", href: "/admin/mesajlar", icon: "✉️", badge: (b) => b.newMessages },
  { key: "yorumlar", label: "Yorumlar", href: "/admin/yorumlar", icon: "⭐", badge: (b) => b.pendingReviews },
  { key: "ayarlar", label: "Ayarlar", href: "/admin/ayarlar", icon: "⚙️" },
];

export default function AdminShell({ user, activeSection, children }: AdminShellProps) {
  const router = useRouter();
  const [badges, setBadges] = useState<AdminBadges | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/summary", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { badges?: AdminBadges } | null) => alive && d?.badges && setBadges(d.badges))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [activeSection]);

  const logout = () =>
    // NEXTAUTH_URL sitenin açıldığı adresten farklıysa callbackUrl yanlış porta gider; yönlendirme burada
    void signOut({ redirect: false }).finally(() => {
      router.push("/admin/giris");
      router.refresh();
    });

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.header}>
          <Link href="/admin" className={styles.brand}>
            <span aria-hidden="true">🫒</span>
            <span>Çiftçi Ece</span>
          </Link>
          <span className={styles.role}>Yönetim</span>
        </div>

        <nav className={styles.nav} aria-label="Yönetim menüsü">
          {NAV_ITEMS.map((item) => {
            const count = badges && item.badge ? item.badge(badges) : 0;
            const urgent = badges && item.urgent ? item.urgent(badges) : 0;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`${styles.navItem} ${activeSection === item.key ? styles.active : ""}`}
                aria-current={activeSection === item.key ? "page" : undefined}
              >
                <span aria-hidden="true">{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
                {urgent > 0 && (
                  <span className={`${styles.count} ${styles.urgent}`} title="Dikkat gerektiriyor">
                    {urgent}
                  </span>
                )}
                {count > 0 && <span className={styles.count}>{count}</span>}
              </Link>
            );
          })}
        </nav>

        <div className={styles.footer}>
          <span className={styles.email}>{user.email}</span>
          <Link href="/admin/ayarlar#hesap" className={styles.siteLink}>
            Hesabım
          </Link>
          <button type="button" onClick={logout} className={styles.logout}>
            Çıkış yap
          </button>
          <Link href="/" className={styles.siteLink}>
            Siteye dön
          </Link>
        </div>
      </aside>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
