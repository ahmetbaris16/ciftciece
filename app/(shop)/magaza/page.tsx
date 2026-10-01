import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { STORE, getFormattedHours } from "@/lib/config/store";
import MagazaMap from "./MagazaMap";
import DirectionsActions from "@/components/store/DirectionsActions";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Mağazamız",
  description: `${STORE.name} — ${STORE.address.full}. Zeytinciler Çarşısı'nda bizi ziyaret edin.`,
};

const GALLERY_IMAGES = [
  {
    src: "/images/store/magaza-dis-cephe.jpg",
    alt: "Çiftçi Ece mağaza dış cephe görünümü",
    caption: "Mağaza Girişi",
  },
  {
    src: "/images/atmosphere/tezgah-gemlik-zeytin.jpg",
    alt: "Tezgâhta Gemlik siyah zeytin",
    caption: "Tezgâhtan Gemlik Zeytini",
  },
  {
    src: "/images/products/zeytinyagi/ciftciece-sizma-1l.jpg",
    alt: "Çiftçi Ece naturel sızma zeytinyağı 1 L",
    caption: "Naturel Sızma Zeytinyağı",
  },
  {
    src: "/images/products/zeytin/ciftciece-gemlik-zeytin-1kg.jpg",
    alt: "Çiftçi Ece Gemlik zeytin 1 kg paket",
    caption: "Gemlik Zeytin 1 kg",
  },
  {
    src: "/images/atmosphere/magaza-zeytin-tepsi.jpg",
    alt: "Mağazada kuru sele siyah zeytin",
    caption: "Kuru Sele Zeytin",
  },
  {
    src: "/images/products/diger/kestane-sekeri-kavanoz.jpg",
    alt: "Bülent Dağlı kavanoz kestane şekeri",
    caption: "Kestane Şekeri",
  },
];

export default function MagazaPage() {
  const hours = getFormattedHours();

  return (
    <>
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroImage}>
          <Image
            src="/images/store/magaza-dis-cephe.jpg"
            alt="Çiftçi Ece mağaza dış görünümü — Orhangazi Zeytinciler Çarşısı"
            fill
            loading="eager"
            fetchPriority="high"
            sizes="100vw"
          />
          <div className={styles.heroOverlay} aria-hidden="true" />
        </div>
        <div className={styles.heroContent}>
          <nav className={styles.heroBreadcrumb} aria-label="Breadcrumb">
            <Link href="/">Ana Sayfa</Link>
            <span aria-hidden="true">›</span>
            <span>Mağazamız</span>
          </nav>
          <h1 className={styles.heroTitle}>Mağazamız</h1>
          <p className={styles.heroSubtext}>
            {STORE.address.neighborhood}, Zeytinciler Çarşısı. Her gün{" "}
            {STORE.hours.monday.open}–{STORE.hours.monday.close} arası açığız.
          </p>
        </div>
      </section>

      {/* ── About ── */}
      <section className={styles.aboutSection}>
        <div className={styles.aboutContainer}>
          <div className={styles.aboutGrid}>
            <div className={styles.aboutImageWrap}>
              <Image
                src="/images/atmosphere/magaza-zeytin-tepsi.jpg"
                alt="Çiftçi Ece mağaza içi — taze zeytinler"
                fill
                sizes="(max-width: 900px) 100vw, 50vw"
              />
              <div className={styles.aboutImageAccent} aria-hidden="true" />
            </div>

            <div className={styles.aboutContent}>
              <p className={styles.aboutEyebrow}>Hakkımızda</p>
              <h2 className={styles.aboutTitle}>
                Zeytinciler Çarşısı&apos;nda
                <br />
                bir zeytin dükkânı
              </h2>
              <p className={styles.aboutText}>
                Çiftçi Ece, Orhangazi Zeytinciler Çarşısı&apos;nda zeytin,
                zeytinyağı ve yöresel ürünler satan bir mağaza. Rafta sızma
                zeytinyağı, sofralık zeytin, turşu, kahvaltılık, kestane şekeri
                ve zeytinyağlı sabun bulunur.
              </p>
              <p className={styles.aboutText}>
                Ürünleri mağazaya gelip görerek ve tadarak alabilir, dilerseniz
                sitemizden sipariş verip kargoyla teslim alabilirsiniz.
              </p>

              <div className={styles.features}>
                <div className={styles.featureCard}>
                  <p className={styles.featureLabel}>
                    Her gün {STORE.hours.monday.open}–{STORE.hours.monday.close}
                  </p>
                </div>
                <div className={styles.featureCard}>
                  <p className={styles.featureLabel}>Zeytinciler Çarşısı</p>
                </div>
                <div className={styles.featureCard}>
                  <p className={styles.featureLabel}>Mağazadan kargo</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Gallery ── */}
      <section className={styles.gallerySection}>
        <div className={styles.galleryContainer}>
          <header className={styles.galleryHeader}>
            <p className={styles.galleryEyebrow}>Galeri</p>
            <h2 className={styles.galleryTitle}>Mağazamızdan Kareler</h2>
          </header>

          <div className={styles.galleryGrid}>
            {GALLERY_IMAGES.map((img) => (
              <div key={img.src} className={styles.galleryItem}>
                <Image
                  src={img.src}
                  alt={img.alt}
                  fill
                  sizes="(max-width: 600px) 100vw, (max-width: 900px) 50vw, 33vw"
                />
                <div className={styles.galleryOverlay} />
                <span className={styles.galleryCaption}>{img.caption}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Info + Map ── */}
      <section className={styles.infoSection}>
        <div className={styles.infoContainer}>
          <div className={styles.infoGrid}>
            <div className={styles.infoCol}>
              {/* Address Card */}
              <div className={styles.infoCard}>
                <h3 className={styles.infoCardTitle}>
                  <svg
                    className={styles.infoCardIcon}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  Adres
                </h3>
                <address className={styles.addressText}>
                  <strong>
                    {STORE.address.neighborhood}, {STORE.address.street}
                  </strong>
                  {STORE.address.postalCode} {STORE.address.district} /{" "}
                  {STORE.address.city}
                  <br />
                  <a
                    href={`tel:${STORE.contact.phone}`}
                    className={styles.phoneLink}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.43a2 2 0 0 1 1.99-2.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" />
                    </svg>
                    {STORE.contact.phoneFormatted}
                  </a>
                </address>
              </div>

              {/* Hours Card */}
              <StoreHoursCard hours={hours} />

              {/* CTA Group — yol tarifi müşterinin gerçek konumundan başlar */}
              <DirectionsActions groupClassName={styles.ctaGroup} />
            </div>

            {/* Map */}
            <div className={styles.mapCol}>
              <MagazaMap />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ── Client sub-component for live store status ── */
function StoreHoursCard({
  hours,
}: {
  hours: ReturnType<typeof getFormattedHours>;
}) {
  return (
    <div className={styles.infoCard}>
      <h3 className={styles.infoCardTitle}>
        <svg
          className={styles.infoCardIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        Çalışma Saatleri
      </h3>

      <div className={styles.hoursList}>
        {hours.map((row) => (
          <div key={row.day} className={styles.hoursRow}>
            <span className={styles.hoursDay}>{row.day}</span>
            <span className={styles.hoursTime}>
              {row.isOpen
                ? `${row.open} – ${row.close === "00:00" ? "00:00" : row.close}`
                : "Kapalı"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
