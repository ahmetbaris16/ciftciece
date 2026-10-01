/**
 * İletişim — /iletisim
 * E-ticaret yönetmeliği: satıcının tanıtıcı bilgileri (unvan/ad-soyad, MERSİS ya da vergi no, adres, telefon,
 * e-posta, varsa KEP ve meslek odası) "iletişim" başlığı altında doğrudan erişilebilir olmalı. Bilgiler admin →
 * İşletme bilgileri'nden gelir.
 */

import type { Metadata } from "next";
import Link from "next/link";
import ContactForm from "@/components/contact/ContactForm";
import { getBusinessInfo } from "@/lib/business/business.repository";
import { formatPhoneTr, sellerLines } from "@/lib/business/info";
import { STORE, getFormattedHours } from "@/lib/config/store";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "İletişim",
  description: "Çiftçi Ece ile iletişim: telefon, WhatsApp, e-posta, mağaza adresi ve iletişim formu.",
};

export const revalidate = 300;

interface Props {
  searchParams: Promise<{ konu?: string; siparis?: string }>;
}

export default async function IletisimPage({ searchParams }: Props) {
  const [business, params] = await Promise.all([getBusinessInfo(), searchParams]);
  const hours = getFormattedHours();
  const allSame = hours.every((h) => h.open === hours[0].open && h.close === hours[0].close && h.isOpen);
  const whatsapp = business.whatsapp
    ? `https://wa.me/${business.whatsapp}?text=${encodeURIComponent("Merhaba, sitenizden yazıyorum.")}`
    : null;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Müşteri hizmetleri</p>
          <h1 className={styles.title}>Bize ulaşın</h1>
          <p className={styles.lead}>
            Siparişiniz, ürünlerimiz ya da iade hakkında her sorunuz için buradayız. En hızlı yanıt telefon ve WhatsApp&apos;tan
            gelir; e-postaları iş günlerinde aynı gün yanıtlamaya çalışırız.
          </p>
        </header>

        <div className={styles.layout}>
          <aside className={styles.channels} aria-label="İletişim kanalları">
            <a className={styles.channel} href={`tel:${business.phone}`}>
              <span className={styles.channelIcon} aria-hidden="true"><Icon d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></span>
              <span>
                <strong>Telefon</strong>
                <span>{formatPhoneTr(business.phone)}</span>
              </span>
            </a>
            {whatsapp && (
              <a className={styles.channel} href={whatsapp} target="_blank" rel="noopener noreferrer">
                <span className={styles.channelIcon} aria-hidden="true"><Icon d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></span>
                <span>
                  <strong>WhatsApp</strong>
                  <span>Mesaj gönderin</span>
                </span>
              </a>
            )}
            {business.email && (
              <a className={styles.channel} href={`mailto:${business.email}`}>
                <span className={styles.channelIcon} aria-hidden="true"><Icon d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm18 2-10 7L2 6" /></span>
                <span>
                  <strong>E-posta</strong>
                  <span>{business.email}</span>
                </span>
              </a>
            )}
            <div className={styles.channel}>
              <span className={styles.channelIcon} aria-hidden="true"><Icon d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /></span>
              <span>
                <strong>Mağazamız</strong>
                <span>{business.address}</span>
                <span className={styles.muted}>
                  {allSame ? `Her gün ${hours[0].open} – ${hours[0].close}` : "Çalışma saatleri için mağaza sayfasına bakın"}
                </span>
                <span className={styles.links}>
                  <a href={STORE.address.googleMapsUrl} target="_blank" rel="noopener noreferrer">
                    Haritada aç
                  </a>
                  <Link href="/magaza">Mağaza sayfası</Link>
                </span>
              </span>
            </div>

            <section className={styles.seller} aria-labelledby="seller-title">
              <h2 id="seller-title">Satıcı bilgileri</h2>
              <dl>
                {sellerLines(business).map((l) => (
                  <div key={l.label}>
                    <dt>{l.label}</dt>
                    <dd>{l.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </aside>

          <section className={styles.formCard} aria-labelledby="form-title">
            <h2 id="form-title">Mesaj gönderin</h2>
            <p className={styles.muted}>
              Siparişinizle ilgiliyse sipariş numaranızı yazın. İade ya da iptal için sipariş sayfanızdaki “İade / iptal”
              bölümü daha hızlıdır.
            </p>
            <ContactForm defaultSubject={params.konu} defaultOrder={params.siparis} />
          </section>
        </div>
      </div>
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
