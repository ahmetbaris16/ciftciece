/**
 * Yasal metin bölümlerini (lib/legal/content.ts) gösterir: başlık, etiket–değer satırları, paragraf, liste, not.
 * Hem yasal sayfalarda hem ödeme adımındaki açılır kutuda kullanılır (en az 12 punto: Yönetmelik md. 6).
 */

import type { LegalSection } from "@/lib/legal/content";
import styles from "./LegalSections.module.css";

export default function LegalSections({ sections, compact = false }: { sections: LegalSection[]; compact?: boolean }) {
  return (
    <div className={`${styles.wrap} ${compact ? styles.compact : ""}`}>
      {sections.map((s) => (
        <section key={s.heading} className={styles.section}>
          <h2 className={styles.heading}>{s.heading}</h2>
          {s.rows && s.rows.length > 0 && (
            <dl className={styles.rows}>
              {s.rows.map((r, i) => (
                <div key={`${r.label}-${i}`} className={styles.row}>
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {s.paragraphs?.map((p, i) => (
            <p key={i} className={styles.p}>
              {p}
            </p>
          ))}
          {s.list && (
            <ul className={styles.list}>
              {s.list.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
          {s.note && <p className={styles.note}>{s.note}</p>}
        </section>
      ))}
    </div>
  );
}
