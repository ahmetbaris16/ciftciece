/**
 * Puan yıldızları (salt gösterim) — ondalık ortalamayı kısmi dolgu ile gösterir (ör. 4,3).
 * Sunucu bileşeni olarak da kullanılabilir (hook yok).
 */

import type { CSSProperties } from "react";
import styles from "./RatingStars.module.css";

const STAR = "M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6z";

function Row({ size }: { size: number }) {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d={STAR} fill="currentColor" />
        </svg>
      ))}
    </>
  );
}

export default function RatingStars({
  value,
  size = 16,
  label,
  className,
}: {
  value: number;
  size?: number;
  label?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, value));
  const style = { "--star-gap": `${Math.max(1, Math.round(size / 8))}px` } as CSSProperties;
  return (
    <span
      className={`${styles.stars} ${className ?? ""}`}
      style={style}
      role="img"
      aria-label={label ?? `5 üzerinden ${clamped.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} puan`}
    >
      <span className={styles.base}>
        <Row size={size} />
      </span>
      <span className={styles.fill} style={{ width: `${(clamped / 5) * 100}%` }}>
        <Row size={size} />
      </span>
    </span>
  );
}
