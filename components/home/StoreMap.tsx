"use client";

/**
 * StoreMap — Leaflet + OpenStreetMap (raster tile, WebGL gerektirmez)
 *
 * MapLibre + OpenFreeMap stabil çalışmadığı için Leaflet'e geçildi.
 * - Konum ve linkler tek kaynaktan: lib/config/store.ts
 * - Leaflet CSS paketle birlikte gelir (harici CDN'e bağımlılık yok)
 * - Harita viewport'a yaklaşınca yüklenir; bölüm içinde sabit durur (sticky değil)
 * - Mobilde sürükleme kapalı: sayfa kaydırması haritaya takılmaz
 * - Yol tarifi / Google Haritalar butonları haritanın dışında, bölümün kendisinde;
 *   burada yalnızca harita yüklenemezse gösterilir.
 */

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { STORE } from "@/lib/config/store";
import DirectionsActions from "@/components/store/DirectionsActions";
import styles from "./StoreMap.module.css";

interface StoreMapProps {
  className?: string;
}

export default function StoreMap({ className }: StoreMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    let map: import("leaflet").Map | null = null;

    const initMap = async () => {
      let L: typeof import("leaflet");
      try {
        L = await import("leaflet");
      } catch {
        if (!cancelled) setError(true);
        return;
      }
      if (cancelled) return;

      try {
        const { lat, lng } = STORE.address;
        const isMobile = window.matchMedia("(max-width: 767px)").matches;

        map = L.map(el, {
          center: [lat, lng],
          zoom: isMobile ? 16 : 17, // çarşı küçük: sokak adları ve karayolu kenarı okunsun
          scrollWheelZoom: false,
          zoomControl: !isMobile,
          dragging: !isMobile,
          attributionControl: true,
        });

        const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        });
        tiles.once("load", () => !cancelled && setLoaded(true));
        tiles.addTo(map);

        const markerIcon = L.divIcon({
          className: styles.marker,
          html: `
            <div class="${styles.markerPin}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                <circle cx="12" cy="10" r="3" fill="rgba(0,0,0,0.35)"/>
              </svg>
            </div>
            <div class="${styles.markerPulse}"></div>
          `,
          iconSize: [40, 50],
          iconAnchor: [20, 50],
          popupAnchor: [0, -50],
        });

        L.marker([lat, lng], { icon: markerIcon, title: STORE.name, alt: `${STORE.name} mağazası` })
          .addTo(map)
          .bindPopup(
            `<div class="${styles.popup}"><strong>${STORE.name}</strong><br/>${STORE.address.street}, ${STORE.address.district}</div>`
          );

        // Konteyner boyutu reveal animasyonundan sonra kesinleşir
        requestAnimationFrame(() => map?.invalidateSize());

        // Tile sunucusu yavaşsa iskelet sonsuza kadar kalmasın
        window.setTimeout(() => !cancelled && setLoaded(true), 5000);
      } catch {
        if (!cancelled) setError(true);
      }
    };

    // Viewport'a 300px yaklaşınca başlat
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          observer.disconnect();
          void initMap();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
      map?.remove();
    };
  }, []);

  if (error) {
    return <MapFallback />;
  }

  return (
    <div className={`${styles.wrap} ${className ?? ""}`}>
      <div
        ref={containerRef}
        className={styles.mapContainer}
        role="region"
        aria-label={`${STORE.name} mağaza konumu haritası`}
      />

      {!loaded && (
        <div className={styles.skeleton} aria-hidden="true">
          <div className={styles.skeletonInner}>
            <MapSvgIcon />
            <span>Harita yükleniyor…</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MapFallback() {
  return (
    <div className={styles.fallback}>
      <div className={styles.fallbackInner}>
        <MapSvgIcon size={40} />
        <div className={styles.fallbackInfo}>
          <strong>{STORE.name}</strong>
          <span>
            {STORE.address.street}, {STORE.address.neighborhood}
          </span>
          <span>
            {STORE.address.postalCode} {STORE.address.district} / {STORE.address.city}
          </span>
        </div>
        <DirectionsActions
          groupClassName={styles.fallbackBtns}
          primaryClassName={styles.directionsBtn}
          secondaryClassName={styles.gmapsBtn}
          showIcon={false}
        />
      </div>
    </div>
  );
}

function MapSvgIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}
