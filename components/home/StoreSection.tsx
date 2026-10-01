"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { STORE, getStoreStatus, getFormattedHours } from "@/lib/config/store";
import DirectionsActions from "@/components/store/DirectionsActions";
import styles from "./StoreSection.module.css";

// Leaflet tarayıcı API'lerine ihtiyaç duyar — SSR yok, bölüm görününce yüklenir
const StoreMap = dynamic(() => import("./StoreMap"), {
  ssr: false,
  loading: () => <div className={styles.mapLoadingSkeleton} aria-hidden="true" />,
});

export default function StoreSection() {
  const [storeStatus, setStoreStatus] = useState<ReturnType<typeof getStoreStatus> | null>(null);
  const hours = getFormattedHours();

  // Açık/kapalı durumu tarayıcı saatine bağlı — SSR ile uyuşmazlık olmasın diye mount sonrası
  useEffect(() => {
    const update = () => setStoreStatus(getStoreStatus());
    const first = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 60000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <section className={styles.section} aria-labelledby="store-heading" id="magaza">
      <div className={styles.container}>
        <div className={styles.grid}>
          {/* ---- Left: Store Info ---- */}
          <div className={styles.infoCol}>
            <span className="section-label">Fiziksel Mağaza</span>
            <h2 className="section-title" id="store-heading">
              Mağazamıza<br />Uğrayın
            </h2>

            {/* Status indicator */}
            {storeStatus && (
              <div
                className={`${styles.statusBadge} ${storeStatus.isOpen ? styles.statusOpen : styles.statusClosed}`}
                aria-live="polite"
              >
                <span className={styles.statusDot} aria-hidden="true" />
                <span>{storeStatus.label}</span>
                {storeStatus.isOpen && storeStatus.closesAt && (
                  <span className={styles.statusTime}>
                    {storeStatus.closesAt}&apos;e kadar
                  </span>
                )}
                {!storeStatus.isOpen && storeStatus.opensAt && (
                  <span className={styles.statusTime}>
                    {storeStatus.opensAt}&apos;de açılıyor
                  </span>
                )}
              </div>
            )}

            {/* Address */}
            <address className={styles.address}>
              <div className={styles.addressLine}>
                <PinIcon />
                <div>
                  <strong>{STORE.address.neighborhood}, {STORE.address.street}</strong>
                  <br />
                  {STORE.address.postalCode} {STORE.address.district} / {STORE.address.city}
                </div>
              </div>
              <div className={styles.addressLine}>
                <PhoneIcon />
                <a href={`tel:${STORE.contact.phone}`} className={styles.phone}>
                  {STORE.contact.phoneFormatted}
                </a>
              </div>
            </address>

            {/* Hours table */}
            <div className={styles.hoursWrap}>
              <h3 className={styles.hoursTitle}>Çalışma Saatleri</h3>
              <dl className={styles.hoursList}>
                {hours.map((row) => (
                  <div key={row.day} className={styles.hoursRow}>
                    <dt className={styles.hoursDay}>{row.day}</dt>
                    <dd className={styles.hoursTime}>
                      {row.isOpen ? `${row.open} – ${row.close === "00:00" ? "00:00 (gece)" : row.close}` : "Kapalı"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* CTAs — yol tarifi müşterinin gerçek konumundan başlar */}
            <DirectionsActions groupClassName={styles.ctaGroup} />
          </div>

          {/* ---- Right: Map Only ---- */}
          <div className={styles.mapCol}>
            <div className={styles.mapWrap}>
              <StoreMap />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.43a2 2 0 0 1 1.99-2.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

