/**
 * Giriş Yap / Üye Ol ekran iskeleti: üstte iki sekmeli geçiş, solda form, sağda üyelik avantajları.
 * Avantajlar yalnızca sitede gerçekten çalışan özellikleri anlatır.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./Auth.module.css";

interface Props {
  /** "sifre": şifre yenileme sayfaları (sekmelerden hiçbiri seçili değil) */
  mode: "giris" | "uye-ol" | "sifre";
  next: string;
  title: string;
  lead: string;
  children: ReactNode;
}

export default function AuthShell({ mode, next, title, lead, children }: Props) {
  const q = next !== "/hesabim" ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.card} aria-labelledby="auth-title">
          <nav className={styles.switch} aria-label="Üyelik">
            <Link
              href={`/giris${q}`}
              className={`${styles.switchLink} ${mode === "giris" ? styles.switchActive : ""}`}
              aria-current={mode === "giris" ? "page" : undefined}
            >
              Giriş Yap
            </Link>
            <Link
              href={`/uye-ol${q}`}
              className={`${styles.switchLink} ${mode === "uye-ol" ? styles.switchActive : ""}`}
              aria-current={mode === "uye-ol" ? "page" : undefined}
            >
              Üye Ol
            </Link>
          </nav>
          <p className={styles.eyebrow}>Çiftçi Ece üyeliği</p>
          <h1 id="auth-title" className={styles.title}>
            {title}
          </h1>
          <p className={styles.lead}>{lead}</p>
          {children}
        </section>

        <aside className={styles.aside} aria-label="Üyelik avantajları">
          <div>
            <h2 className={styles.asideTitle}>Üye olunca</h2>
            <ul className={styles.perks}>
              <li className={styles.perk}>
                <span className={styles.perkIcon} aria-hidden="true">
                  <BoxIcon />
                </span>
                <div>
                  <p className={styles.perkTitle}>Siparişleriniz tek yerde</p>
                  <p className={styles.perkText}>Üye girişiyle verdiğiniz siparişlerin durumunu Hesabım&apos;dan izlersiniz.</p>
                </div>
              </li>
              <li className={styles.perk}>
                <span className={styles.perkIcon} aria-hidden="true">
                  <StarIcon />
                </span>
                <div>
                  <p className={styles.perkTitle}>Ürünleri değerlendirin</p>
                  <p className={styles.perkText}>
                    Puan verip yorum yazın; satın aldığınız ürünlerde yorumunuz &quot;Satın aldı&quot; rozetiyle görünür.
                  </p>
                </div>
              </li>
              <li className={styles.perk}>
                <span className={styles.perkIcon} aria-hidden="true">
                  <BoltIcon />
                </span>
                <div>
                  <p className={styles.perkTitle}>Daha hızlı ödeme</p>
                  <p className={styles.perkText}>Ad, e-posta ve telefonunuz ödeme sayfasında hazır gelir.</p>
                </div>
              </li>
            </ul>
          </div>
          <p className={styles.asideFoot}>Üye olmadan da misafir olarak sipariş verebilirsiniz.</p>
        </aside>
      </div>
    </div>
  );
}

function BoxIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  );
}
