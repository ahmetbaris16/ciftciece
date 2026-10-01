"use client";

/**
 * Ürün sayfası bölüm menüsü — başlığın altına yapışır, kaydırırken bulunulan bölümü vurgular.
 * Bağlantılar düz #çapa: JS'siz de çalışır; kaydırma payı html scroll-padding-top'tan gelir.
 */

import { useEffect, useState } from "react";
import styles from "./ProductSectionNav.module.css";

export interface SectionNavItem {
  id: string;
  label: string;
  count?: number;
}

export default function ProductSectionNav({ items }: { items: SectionNavItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const sections = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => !!el);
    if (sections.length === 0) return;

    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        // Ekranda en çok görünen bölüm; eşitse sayfada önce gelen
        let best = "";
        let bestRatio = 0;
        for (const s of sections) {
          const r = visible.get(s.id) ?? 0;
          if (r > bestRatio) {
            best = s.id;
            bestRatio = r;
          }
        }
        if (best) setActive(best);
      },
      { rootMargin: "-30% 0px -50% 0px", threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav className={styles.nav} aria-label="Ürün bölümleri">
      <div className={styles.inner}>
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={`${styles.link} ${active === item.id ? styles.active : ""}`}
            aria-current={active === item.id ? "true" : undefined}
          >
            {item.label}
            {item.count !== undefined && <span className={styles.count}>{item.count}</span>}
          </a>
        ))}
      </div>
    </nav>
  );
}
