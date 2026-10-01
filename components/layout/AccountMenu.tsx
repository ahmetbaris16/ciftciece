"use client";

/**
 * Başlıktaki hesap menüsü (masaüstü).
 * Girişsiz: "Giriş Yap" → açılır kutuda Giriş Yap / Üye Ol / Sipariş Takibi.
 * Girişli: "Hesabım" → Siparişlerim, Değerlendirmelerim, Hesap Bilgileri, Çıkış Yap.
 * Tıkla aç/kapat; dışarı tıklama ve Esc kapatır.
 */

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./AccountMenu.module.css";

export default function AccountMenu() {
  const { data, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const user = data?.user as { name?: string | null; role?: string } | undefined;
  const isCustomer = status === "authenticated" && user?.role === "CUSTOMER";
  const firstName = (user?.name ?? "").trim().split(/\s+/)[0] ?? "";

  // Sayfa değişince kapan
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const next = pathname && pathname !== "/giris" && pathname !== "/uye-ol" ? pathname : "/hesabim";
  const q = next !== "/hesabim" ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
        aria-label={isCustomer ? "Hesabım menüsü" : "Giriş yap veya üye ol"}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <AccountIcon />
        <span className={styles.label}>
          {isCustomer ? (
            <>
              <span className={styles.small}>{firstName ? `Merhaba, ${firstName}` : "Merhaba"}</span>
              <span>Hesabım</span>
            </>
          ) : (
            <>
              <span className={styles.small}>Hesabım</span>
              <span>Giriş Yap</span>
            </>
          )}
        </span>
      </button>

      <div id={menuId} className={styles.menu} hidden={!open}>
        {isCustomer ? (
          <>
            <p className={styles.greet}>{user?.name ?? "Hesabım"}</p>
            <Link href="/hesabim" className={styles.item} onClick={() => setOpen(false)}>
              Siparişlerim
            </Link>
            <Link href="/hesabim?bolum=degerlendirmeler" className={styles.item} onClick={() => setOpen(false)}>
              Değerlendirmelerim
            </Link>
            <Link href="/hesabim?bolum=bilgiler" className={styles.item} onClick={() => setOpen(false)}>
              Hesap Bilgileri
            </Link>
            <button
              type="button"
              className={`${styles.item} ${styles.signOut}`}
              onClick={() =>
                void signOut({ redirect: false }).finally(() => {
                  setOpen(false);
                  router.push("/");
                  router.refresh();
                })
              }
            >
              Çıkış Yap
            </button>
          </>
        ) : (
          <>
            <Link href={`/giris${q}`} className={styles.primary} onClick={() => setOpen(false)}>
              Giriş Yap
            </Link>
            <Link href={`/uye-ol${q}`} className={styles.secondary} onClick={() => setOpen(false)}>
              Üye Ol
            </Link>
            <p className={styles.note}>Siparişlerinizi takip edin, ürünleri değerlendirin.</p>
            <Link href="/siparis-takip" className={styles.item} onClick={() => setOpen(false)}>
              Üye olmadan sipariş takibi
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function AccountIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
