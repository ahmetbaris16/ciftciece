"use client";

/**
 * Admin iskeleti — yan menü (geniş ekran) / üst menü (telefon) + içerik.
 * Menüde bekleyen işler rozetle görünür (/api/admin/summary): kargolanacak siparişler, havale bekleyenler,
 * ödeme uyarısı, açık müşteri talepleri, okunmamış mesajlar, gönderilemeyen e-postalar.
 * Panel açıkken kendini günceller: özet ucu birkaç saniyede bir yoklanır (sekme görünürken ve sekmeye dönünce);
 * yeni sipariş, ödeme, talep ya da mesaj gelince (ya da başka sekmede bir işlem yapılınca) açık sayfa yenilenir,
 * yöneticinin elle yenilemesi gerekmez. Yazılmakta olan formlar korunur (yalnız sunucu verisi yenilenir).
 */

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
    // Şimdi iş bekleyenler: kargolanacak yeni sipariş + müşteri talebi (havale bekleyen para gelince işe döner)
    badge: (b) => b.toShip + b.openRequests,
    urgent: (b) => b.attention,
  },
  { key: "urunler", label: "Ürünler", href: "/admin/urunler", icon: "📦" },
  { key: "indirimler", label: "İndirimler", href: "/admin/indirimler", icon: "🏷️" },
  { key: "musteriler", label: "Müşteriler", href: "/admin/musteriler", icon: "👥" },
  { key: "mesajlar", label: "Mesajlar", href: "/admin/mesajlar", icon: "✉️", badge: (b) => b.newMessages },
  { key: "ayarlar", label: "Ayarlar", href: "/admin/ayarlar", icon: "⚙️" },
];

/** Özet ucunun yoklanma aralığı (yalnız sekme görünürken) */
const POLL_MS = 10_000;

export default function AdminShell({ user, activeSection, children }: AdminShellProps) {
  const router = useRouter();
  const [badges, setBadges] = useState<AdminBadges | null>(null);
  // Son görülen değişim damgası: sayfa açılışında ve her sunucu yenilemesinden sonra "şu an gösterilen" durum
  const stamp = useRef<string | null>(null);
  const busy = useRef(false);

  /** Özeti çeker; rozetleri günceller. `refreshOnChange`: damga değiştiyse açık sayfayı yeniler */
  const check = useCallback(
    async (refreshOnChange: boolean) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const res = await fetch("/api/admin/summary", { cache: "no-store" });
        // Oturum bitmiş: sunucu sayfası giriş sayfasına yönlendirir
        if (res.status === 401) return void router.refresh();
        if (!res.ok) return;
        const d = (await res.json()) as { badges?: AdminBadges; stamp?: string };
        if (d.badges) setBadges(d.badges);
        if (typeof d.stamp === "string") {
          const changed = stamp.current !== null && stamp.current !== d.stamp;
          stamp.current = d.stamp;
          if (changed && refreshOnChange) router.refresh();
        }
      } catch {
        // Bağlantı kesildi: sonraki yoklamada yeniden denenir
      } finally {
        busy.current = false;
      }
    },
    [router]
  );

  // Sayfa açılınca, sayfa değişince ve sunucu verisi yenilenince (kendi işlemimiz dahil: `children` yeni gelir)
  // rozetler ve damga tazelenir; bu sayfa zaten güncel olduğundan burada yenileme tetiklenmez
  useEffect(() => {
    const first = window.setTimeout(() => void check(false), 0);
    return () => window.clearTimeout(first);
  }, [check, activeSection, children]);

  // Açık panelde yeni sipariş/ödeme/mesaj/talep gelirse sayfayı kendiliğinden yenile
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void check(true);
    };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [check]);

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
