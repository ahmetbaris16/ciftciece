import Image from "next/image";
import Link from "next/link";
import { STORE } from "@/lib/config/store";
import styles from "./VacuumService.module.css";

/**
 * Vakumlu paketleme hizmeti — sepete eklenen bir ürün değil, hizmet tanıtımı.
 * Ziyaretçi bilgi/sipariş için WhatsApp'tan yazar ya da mağazayı arar.
 * Metinler kullanıcının hazırladığı afişten alınmıştır; süre, fiyat, miktar gibi
 * afişte olmayan hiçbir bilgi eklenmemiştir. Kapsam (kullanıcı, 2026-09-30): hizmet
 * YALNIZCA siyah zeytin için geçerlidir — başlık, not ve WhatsApp mesajı bunu belirtir.
 */

const WHATSAPP_URL = `https://wa.me/${STORE.contact.whatsapp}?text=${encodeURIComponent(
  "Merhaba, siyah zeytin için vakumlu paketleme hizmeti hakkında bilgi almak istiyorum."
)}`;

const BENEFITS = [
  { id: "freshness", icon: <LeafIcon />, title: "Tazelik Koruması", desc: "Hava alınır, tazelik korunur." },
  { id: "hygiene", icon: <ShieldIcon />, title: "Hijyenik Ambalaj", desc: "Daha hijyenik ve daha güvenli paketleme." },
  { id: "durability", icon: <ClockIcon />, title: "Uzun Süre Dayanıklılık", desc: "Daha uzun ömürlü saklama." },
];

export default function VacuumService() {
  return (
    <section id="vakumlu-paketleme" className={styles.section} aria-labelledby="vacuum-heading">
      <div className={styles.container}>
        <div className={styles.grid}>
          <div className={styles.head}>
            <span className={styles.label}>Hizmetlerimiz</span>
            <h2 className={styles.title} id="vacuum-heading">
              <span className={styles.titleAccent}>Vakumlu</span> Paketleme Hizmeti
            </h2>
            <span className={styles.rule} aria-hidden="true" />
            <p className={styles.lead}>
              Siyah zeytinlerimiz tazeliğini, lezzetini ve doğal yapısını koruyan vakumlu ambalajla
              hazırlanır. Daha hijyenik, daha güvenli ve daha uzun ömürlü saklama sunar.
            </p>
            <p className={styles.scope}>
              <OliveIcon />
              Vakumlu paketleme hizmeti yalnızca siyah zeytin için geçerlidir.
            </p>
          </div>

          <figure className={styles.photo}>
            <Image
              src="/images/atmosphere/vakumlu-paket-2kg.jpg"
              alt="Çiftçi Ece sofralık siyah zeytin, 2 kg vakumlu paket"
              fill
              sizes="(max-width: 900px) 100vw, 46vw"
              quality={85}
              loading="lazy"
              className={styles.photoImg}
              style={{ objectFit: "cover" }}
            />
          </figure>

          <ul className={styles.benefits} role="list">
            {BENEFITS.map((b) => (
              <li key={b.id} className={styles.benefit}>
                <span className={styles.benefitIcon} aria-hidden="true">{b.icon}</span>
                <div className={styles.benefitText}>
                  <strong className={styles.benefitTitle}>{b.title}</strong>
                  <span className={styles.benefitDesc}>{b.desc}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className={styles.cta}>
            <p className={styles.ctaHint}>Ayrıntılar ve siparişiniz için bize ulaşın.</p>
            <div className={styles.ctaRow}>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.btnPrimary}
                aria-label="WhatsApp'tan yazın: siyah zeytin için vakumlu paketleme (yeni sekmede açılır)"
              >
                <WhatsAppIcon />
                WhatsApp&apos;tan Yaz
              </a>
              <a
                href={`tel:${STORE.contact.phone}`}
                className={styles.btnOutline}
                aria-label={`Mağazayı ara: ${STORE.contact.phoneFormatted}`}
              >
                <PhoneIcon />
                {STORE.contact.phoneFormatted}
              </a>
            </div>
            <Link href="/kategori/zeytin" className={styles.textLink}>
              Zeytinleri İncele
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function OliveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <ellipse cx="10.5" cy="14.5" rx="5.6" ry="7.4" transform="rotate(35 10.5 14.5)" />
      <path d="M14.6 6.2c1.6-2.3 4-3 5.9-2.4-.4 2.4-2.6 4.1-5.6 4.1z" />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.43a2 2 0 0 1 1.99-2.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}
