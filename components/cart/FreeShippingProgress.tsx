"use client";

/**
 * Ücretsiz kargo ilerleme çubuğu — eşik admin → Ayarlar → Kargo'dan gelir (varsayılan 3.000 TL).
 * Ayarlar yüklenemezse hiçbir şey göstermez (tutar uydurulmaz).
 */

import { formatPrice } from "@/types";
import type { PublicShippingInfo } from "@/lib/shipping/settings";
import { isFreeShipping, remainingForFreeShipping } from "@/lib/shipping/settings";
import styles from "./FreeShippingProgress.module.css";

export default function FreeShippingProgress({
  subtotalKurus,
  settings,
}: {
  subtotalKurus: number;
  settings: PublicShippingInfo | null;
}) {
  if (!settings || settings.freeThresholdKurus <= 0) return null;

  const free = isFreeShipping(subtotalKurus, settings);
  const remaining = remainingForFreeShipping(subtotalKurus, settings);
  const ratio = Math.min(1, subtotalKurus / settings.freeThresholdKurus);

  return (
    <div className={`${styles.wrap} ${free ? styles.free : ""}`}>
      <p className={styles.text}>
        <TruckIcon />
        {free ? (
          <span>
            <strong>Kargonuz ücretsiz!</strong> {formatPrice(settings.freeThresholdKurus)} ve üzeri siparişlerde
            kargo bizden.
          </span>
        ) : (
          <span>
            Ücretsiz kargoya <strong>{formatPrice(remaining)}</strong> kaldı
          </span>
        )}
      </p>
      <div
        className={styles.track}
        role="progressbar"
        aria-label="Ücretsiz kargo eşiğine ilerleme"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <span className={styles.fill} style={{ transform: `scaleX(${ratio})` }} />
      </div>
    </div>
  );
}

function TruckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h11v9H3z" />
      <path d="M14 9h4l3 3v3h-7" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17.5" cy="17.5" r="1.8" />
    </svg>
  );
}
