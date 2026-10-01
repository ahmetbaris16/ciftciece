/**
 * Yasal sayfa iskeleti: sayfa yolu, başlık, güncelleme tarihi, içerik, ana sayfaya dönüş.
 */

import Link from "next/link";
import styles from "@/app/(legal)/legal.module.css";

export default function LegalPage({
  title,
  meta,
  updated,
  category = "Yasal",
  children,
}: {
  title: string;
  meta?: string;
  /** "2026-10-02" — metnin son değiştiği gün (siparişte onaylanan sürüm) */
  updated?: string;
  category?: string;
  children: React.ReactNode;
}) {
  const updatedText = updated
    ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeZone: "Europe/Istanbul" }).format(new Date(`${updated}T12:00:00Z`))
    : null;
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <nav className={styles.breadcrumb} aria-label="Sayfa yolu">
            <Link href="/">Ana Sayfa</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{title}</span>
          </nav>
          <span className={styles.category}>{category}</span>
          <h1 className={styles.title}>{title}</h1>
          {meta && <p className={styles.meta}>{meta}</p>}
          {updatedText && <p className={styles.meta}>Son güncelleme: {updatedText}</p>}
        </header>
        <div className={styles.content}>{children}</div>
        <Link href="/" className={styles.backLink}>
          ← Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  );
}
