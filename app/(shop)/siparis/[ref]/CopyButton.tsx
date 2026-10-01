"use client";

/** Tek tıkla panoya kopyala (IBAN, sipariş no, tutar) — kopyalandığında kısa onay gösterir */

import { useState } from "react";
import styles from "./page.module.css";

export default function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      window.setTimeout(() => setDone(false), 1800);
    } catch {
      // Pano izni yoksa metin zaten ekranda seçilebilir
    }
  };
  return (
    <button type="button" className={styles.copyBtn} onClick={copy} aria-label={`${label} kopyala`}>
      {done ? "Kopyalandı" : "Kopyala"}
    </button>
  );
}
