import Image from "next/image";
import Link from "next/link";
import { STORE } from "@/lib/config/store";
import { getBusinessInfo } from "@/lib/business/business.repository";
import { formatPhoneTr, sellerDisplayName } from "@/lib/business/info";
import PaymentMarks from "@/components/payment/PaymentMarks";
import styles from "./Footer.module.css";

const PRODUCT_LINKS = [
  { label: "Zeytinyağı", href: "/kategori/zeytinyagi" },
  { label: "Zeytin", href: "/kategori/zeytin" },
  { label: "Kahvaltılık", href: "/kategori/kahvaltilik" },
  { label: "Turşu", href: "/kategori/tursu" },
  { label: "Kestane Şekeri", href: "/kategori/kestane-sekeri" },
  { label: "Sirke & İçecek", href: "/kategori/sirke-icecek" },
  { label: "Zeytinyağlı Sabun", href: "/kategori/sabun" },
  { label: "Tüm Ürünler", href: "/urunler" },
];

const SERVICE_LINKS = [
  { label: "İletişim", href: "/iletisim" },
  { label: "Sıkça Sorulan Sorular", href: "/sss" },
  { label: "Sipariş Takibi", href: "/siparis-takip" },
  { label: "Teslimat Bilgileri", href: "/teslimat" },
  { label: "İade & İptal", href: "/iade-ve-iptal" },
  { label: "Mağazamız", href: "/magaza" },
  { label: "Vakumlu Paketleme", href: "/#vakumlu-paketleme" },
  { label: "Hesabım", href: "/hesabim" },
];

const LEGAL_LINKS = [
  { label: "Gizlilik Politikası", href: "/gizlilik" },
  { label: "KVKK Aydınlatma", href: "/kvkk" },
  { label: "Çerez Politikası", href: "/cerez-politikasi" },
  { label: "Mesafeli Satış Sözleşmesi", href: "/mesafeli-satis-sozlesmesi" },
  { label: "Ön Bilgilendirme", href: "/on-bilgilendirme" },
  { label: "Üyelik Sözleşmesi", href: "/uyelik-sozlesmesi" },
  { label: "Kullanım Koşulları", href: "/kullanim-kosullari" },
];

export default async function Footer() {
  const currentYear = new Date().getFullYear();
  // İşletme bilgileri admin → Ayarlar'dan (adres, telefon, e-posta, Instagram)
  const business = await getBusinessInfo();

  return (
    <footer className={styles.footer} role="contentinfo">
      <div className={styles.inner}>
        {/* ---- Brand Column ---- */}
        <div className={styles.brand}>
          <Link href="/" className={styles.brandLogo} aria-label={`${STORE.name} — Ana Sayfa`}>
            <Image
              src="/images/brand/logo-gold.png"
              alt="Çiftçi Ece — Zeytin, Zeytinyağı, Doğal Ürünler"
              width={619}
              height={291}
              sizes="200px"
              style={{ width: 200, height: "auto" }}
            />
          </Link>

          <address className={styles.address}>
            <p>{business.address}</p>
            <p>
              <a href={`tel:${business.phone}`} className={styles.contactLink}>
                {formatPhoneTr(business.phone)}
              </a>
            </p>
            {business.email && (
              <p>
                <a href={`mailto:${business.email}`} className={styles.contactLink}>
                  {business.email}
                </a>
              </p>
            )}
            {business.instagramUrl && (
              <p>
                <a
                  href={business.instagramUrl}
                  className={`${styles.contactLink} ${styles.socialLink}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <InstagramIcon />
                  {instagramHandle(business.instagramUrl)}
                </a>
              </p>
            )}
          </address>

          <Link href="/magaza" className={styles.storeBtn}>
            Mağazaya Uğrayın →
          </Link>
        </div>

        {/* ---- Ürünler ---- */}
        <nav aria-label="Ürün kategorileri">
          <h3 className={styles.colTitle}>Ürünler</h3>
          <ul className={styles.linkList} role="list">
            {PRODUCT_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={styles.link}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* ---- Müşteri Hizmetleri ---- */}
        <nav aria-label="Müşteri hizmetleri">
          <h3 className={styles.colTitle}>Müşteri Hizmetleri</h3>
          <ul className={styles.linkList} role="list">
            {SERVICE_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={styles.link}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* ---- Yasal ---- */}
        <nav aria-label="Yasal bilgiler">
          <h3 className={styles.colTitle}>Yasal</h3>
          <ul className={styles.linkList} role="list">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={styles.link}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* ---- Bottom Bar ---- */}
      <div className={styles.bottomBar}>
        <div className={styles.bottomInner}>
          <p className={styles.copyright}>
            © {currentYear} {sellerDisplayName(business)}. Tüm hakları saklıdır.
          </p>
          <div className={styles.securityBadges}>
            <span className={styles.badge} title="SSL ile şifreli bağlantı">
              <LockIcon />
              SSL Güvenli
            </span>
            <PaymentMarks compact showSecure={false} />
          </div>
        </div>
      </div>
    </footer>
  );
}

function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37Z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/** "https://www.instagram.com/ciftciecezeytinleri/" → "@ciftciecezeytinleri" */
function instagramHandle(url: string): string {
  const m = /instagram\.com\/([A-Za-z0-9._]+)/.exec(url);
  return m ? `@${m[1]}` : "Instagram";
}
