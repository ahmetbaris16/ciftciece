"use client";

/**
 * ReviewsSection — gerçek bir akıllı telefonda Google Haritalar "Yorumlar" ekranı gibi görünür.
 *
 * - Telefon: metal çerçeve, yan tuşlar, dinamik ada, ekran yansıması, zemin gölgesi; hafif perspektif.
 * - Ekran: gerçek yerel saat (dakikada bir güncellenir), sinyal/Wi-Fi/pil simgeleri, uygulama başlığı,
 *   sekmeler, puan özeti (gerçek yorumlardan hesaplanır) ve yorum listesi (DB'deki gerçek yorumlar).
 *   Ekran süslemeleri (durum çubuğu, sekmeler, geri okları) dekoratiftir: aria-hidden.
 * - Yorumlar dikey kaydırılır (telefondaki gibi); içerik ekrana sığıyorsa sayfa kaydırması engellenmez.
 * - Giriş: CSS scroll-driven animation (animation-timeline: view()); desteklemeyen tarayıcıda
 *   IntersectionObserver ile tek seferlik yumuşak giriş. Scroll hijacking YOK.
 * - prefers-reduced-motion: giriş ve eğim geçişleri kapalı.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { STORE } from "@/lib/config/store";
import styles from "./ReviewsSection.module.css";

interface Review {
  id: string;
  authorName: string;
  rating: number;
  text: string;
  date: string;
  source: string | null;
}

interface ReviewsSectionProps {
  reviews: Review[];
}

const AVATAR_COLORS = ["#1a73e8", "#d93025", "#188038", "#e37400", "#9334e6", "#0b8a9b"];

function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toLocaleUpperCase("tr-TR")
    .slice(0, 2);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("tr-TR", { year: "numeric", month: "long" });
}

function sourceLabel(source: string | null): string | null {
  if (!source) return null;
  if (source.toLowerCase() === "google") return "Google yorumu";
  if (source.toLowerCase() === "manual") return "Mağaza müşterisi";
  return source;
}

/** Telefonun saati: sunucuda sabit, tarayıcıda gerçek yerel saat (uyuşmazlık olmasın diye mount sonrası) */
function usePhoneTime(): string {
  const [time, setTime] = useState("09:41");
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 20000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);
  return time;
}

function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  return (
    <span className={`${styles.stars} ${className}`} role="img" aria-label={`5 üzerinden ${rating} yıldız`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 24 24" className={n <= rating ? styles.starOn : styles.starOff} aria-hidden="true">
          <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      ))}
    </span>
  );
}

export default function ReviewsSection({ reviews }: ReviewsSectionProps) {
  const total = reviews.length;
  const time = usePhoneTime();
  const [entered, setEntered] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  // Giriş animasyonu için yedek (scroll-driven animation yoksa CSS bu sınıfı kullanır)
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setEntered(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (total === 0) return null; // yayında yorum yoksa bölüm hiç görünmez

  const avg = reviews.reduce((s, r) => s + r.rating, 0) / total;
  const avgLabel = avg.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, count: reviews.filter((r) => r.rating === n).length }));

  return (
    <section className={styles.section} aria-labelledby="reviews-heading">
      <div className={styles.container}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Müşteri Yorumları</p>
          <h2 id="reviews-heading" className={styles.title}>
            Mağazamıza uğrayanlar <em className={styles.titleItalic}>ne diyor?</em>
          </h2>
        </header>

        <div ref={stageRef} className={`${styles.stage} ${entered ? styles.entered : ""}`}>
          <div className={styles.phoneWrap}>
            <div className={styles.phone}>
              {/* yan tuşlar */}
              <span className={`${styles.hw} ${styles.hwAction}`} aria-hidden="true" />
              <span className={`${styles.hw} ${styles.hwVolUp}`} aria-hidden="true" />
              <span className={`${styles.hw} ${styles.hwVolDown}`} aria-hidden="true" />
              <span className={`${styles.hw} ${styles.hwPower}`} aria-hidden="true" />

              <div className={styles.bezel}>
                <div className={styles.screen}>
                  <div className={styles.island} aria-hidden="true">
                    <i />
                  </div>

                  <div className={styles.statusBar} aria-hidden="true">
                    <span className={styles.time}>{time}</span>
                    <span className={styles.sysIcons}>
                      <SignalIcon />
                      <WifiIcon />
                      <BatteryIcon />
                    </span>
                  </div>

                  <div className={styles.appBar} aria-hidden="true">
                    <BackIcon />
                    <span className={styles.placeName}>Çiftçi Ece</span>
                    <ShareIcon />
                  </div>

                  <div className={styles.tabs} aria-hidden="true">
                    <span>Genel Bakış</span>
                    <span className={styles.tabActive}>Yorumlar</span>
                    <span>Hakkında</span>
                  </div>

                  <div className={styles.scroller} role="region" aria-label="Müşteri yorumları" tabIndex={0}>
                    <div className={styles.summary}>
                      <div className={styles.score}>
                        <span className={styles.scoreNum}>{avgLabel}</span>
                        <Stars rating={Math.round(avg)} className={styles.starsMd} />
                        <span className={styles.scoreCount}>{total} yorum</span>
                      </div>
                      <div className={styles.bars} aria-hidden="true">
                        {dist.map(({ n, count }) => (
                          <div key={n} className={styles.barRow}>
                            <span>{n}</span>
                            <span className={styles.barTrack}>
                              <span className={styles.barFill} style={{ width: `${(count / total) * 100}%` }} />
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <ul className={styles.list} role="list">
                      {reviews.map((review) => (
                        <li key={review.id} className={styles.item}>
                          <article>
                            <div className={styles.itemHead}>
                              <span
                                className={styles.avatar}
                                style={{ backgroundColor: avatarColor(review.authorName) }}
                                aria-hidden="true"
                              >
                                {getInitials(review.authorName)}
                              </span>
                              <div className={styles.itemWho}>
                                <p className={styles.itemName}>{review.authorName}</p>
                                {sourceLabel(review.source) && (
                                  <p className={styles.itemMeta}>{sourceLabel(review.source)}</p>
                                )}
                              </div>
                            </div>
                            <div className={styles.itemRating}>
                              <Stars rating={review.rating} className={styles.starsSm} />
                              <span className={styles.itemDate}>{formatDate(review.date)}</span>
                            </div>
                            {review.text && <p className={styles.itemText}>{review.text}</p>}
                          </article>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className={styles.homeIndicator} aria-hidden="true" />
                  <div className={styles.glare} aria-hidden="true" />
                </div>
              </div>
            </div>
            <div className={styles.groundShadow} aria-hidden="true" />
          </div>

          <div className={styles.sidePanel}>
            <p className={styles.sideScore}>
              <span className={styles.sideScoreNum}>{avgLabel}</span>
              <Stars rating={Math.round(avg)} className={styles.starsLg} />
            </p>
            <p className={styles.sideCaption}>{total} yorumun ortalaması</p>
            <div className={styles.sideActions}>
              <a
                href={STORE.address.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.sideCta}
                aria-label="Google Haritalar'da gör (yeni sekmede açılır)"
              >
                Google Haritalar&apos;da Gör
              </a>
              <Link href="/magaza" className={styles.sideLink}>
                Mağazamıza Uğrayın
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---- Telefon sistem simgeleri (dekoratif) ---- */
function SignalIcon() {
  return (
    <svg viewBox="0 0 18 12" width="1.35em" height="0.9em" aria-hidden="true">
      <rect x="0" y="8" width="3" height="4" rx="0.8" />
      <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
      <rect x="10" y="3" width="3" height="9" rx="0.8" />
      <rect x="15" y="0" width="3" height="12" rx="0.8" opacity="0.3" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg viewBox="0 0 16 12" width="1.2em" height="0.9em" aria-hidden="true">
      <path d="M8 2.6c2.2 0 4.2.9 5.7 2.3l1-1.1C12.9 2.1 10.6 1 8 1S3.1 2.1 1.3 3.8l1 1.1C3.8 3.5 5.8 2.6 8 2.6Z" />
      <path d="M8 6c1.3 0 2.5.5 3.4 1.3l1-1.1C11.3 5.2 9.7 4.5 8 4.5S4.7 5.2 3.6 6.2l1 1.1C5.5 6.5 6.7 6 8 6Z" />
      <circle cx="8" cy="9.8" r="1.4" />
    </svg>
  );
}

function BatteryIcon() {
  return (
    <svg viewBox="0 0 27 13" width="1.9em" height="0.95em" aria-hidden="true">
      <rect x="0.5" y="0.5" width="22" height="12" rx="3.6" fill="none" stroke="currentColor" opacity="0.4" />
      <rect x="2.2" y="2.2" width="15.6" height="8.6" rx="2.2" />
      <path d="M24.2 4.4v4.2c.9-.3 1.6-1.2 1.6-2.1s-.7-1.8-1.6-2.1Z" opacity="0.45" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1.6em" height="1.6em" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1.45em" height="1.45em" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="2.6" />
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="18" cy="19" r="2.6" />
      <path d="M8.3 10.8 15.7 6.2M8.3 13.2l7.4 4.6" />
    </svg>
  );
}
