import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";
import { formatPrice } from "@/types";
import { getShippingSettings } from "@/lib/shipping/shipping.repository";
import { CARRIER } from "@/lib/shipping/settings";

// Ücretsiz kargo eşiği admin panelinden değişebilir
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Teslimat Bilgileri",
  description:
    "Çiftçi Ece teslimat bilgileri — kargo süreleri, kargo ücretleri ve teslimat bölgeleri.",
  robots: { index: true, follow: true },
};

export default async function TeslimatPage() {
  const shipping = await getShippingSettings();
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <nav className={styles.breadcrumb} aria-label="Sayfa yolu">
            <Link href="/">Ana Sayfa</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Teslimat Bilgileri</span>
          </nav>
          <span className={styles.category}>Müşteri Hizmetleri</span>
          <h1 className={styles.title}>Teslimat Bilgileri</h1>
          <p className={styles.meta}>Son güncelleme: Eylül 2026</p>
        </header>

        <div className={styles.content}>
          <h2>Kargo ile Teslimat</h2>

          <h3>Teslimat Süreleri</h3>
          <p>
            Siparişleriniz, ödeme onayından sonra genellikle{" "}
            <strong>1-3 iş günü</strong> içinde {CARRIER.name}&apos;ya verilir. Kargo
            firmasının bölgenize göre teslimat süresi{" "}
            <strong>1-5 iş günü</strong> arasında değişmektedir.
          </p>
          <p>
            Toplam teslimat süresi: <strong>2-8 iş günü</strong>
          </p>

          <div className={styles.infoBox}>
            <p>
              Yoğun sezon (bayram dönemleri, hasad mevsimi) veya stok
              durumuna göre teslimat süreleri uzayabilir. Bu durumda
              sipariş onay e-postasında tahmini süre belirtilir.
            </p>
          </div>

          <h3>Kargo Bedeli</h3>
          <p>
            <strong>{formatPrice(shipping.freeThresholdKurus)} ve üzeri</strong> siparişlerde
            kargo ücretsizdir. Bu tutarın altındaki siparişlerde kargo bedeli,
            siparişinizin ağırlığı ve paket boyutuna (desi) göre hesaplanır ve siparişi
            onaylamadan önce ödeme sayfasında gösterilir. Aynı pakete sığan ürünler
            için ayrı ayrı kargo ücreti alınmaz.
          </p>
          <p>Siparişler yalnızca yurt içine, {CARRIER.name} ile gönderilir.</p>

          <h3>Ürünlerin Paketlenmesi</h3>
          <p>
            Zeytinyağı, zeytin ve diğer cam/kırılabilir ürünler özel korumalı
            ambalaj ile gönderilmektedir. Ürünlerin güvenli şekilde ulaşması
            için gerekli önlemler alınmaktadır.
          </p>

          <h2>Mağazadan Alışveriş</h2>
          <p>
            Ürünlerimizi Zeytinciler Çarşısı&apos;ndaki mağazamızdan her gün
            doğrudan satın alabilirsiniz.
          </p>

          <div className={styles.contactCard}>
            <h3>Mağaza Adresimiz</h3>
            <p>
              <strong>Çiftçi Ece</strong>
            </p>
            <p>Muradiye, Zeytinciler Çarşısı</p>
            <p>16800 Orhangazi / Bursa</p>
            <p style={{ marginTop: "0.75rem" }}>
              <strong>Çalışma Saatleri:</strong>
              <br />
              Her gün <strong>07:00 – 00:00</strong>
            </p>
          </div>

          <h2>Teslimat Bölgeleri</h2>
          <p>
            Türkiye&apos;nin tüm illerine kargo ile gönderim yapılmaktadır.
            Uzak bölgeler (ada, köy, köy mezrası vb.) için teslimat
            süreleri uzayabilir.
          </p>
          <p>
            <strong>Şu an için yurt dışı kargo yapılmamaktadır.</strong>
          </p>

          <h2>Teslimat Takibi</h2>
          <p>
            Siparişiniz kargoya verildikten sonra, kargo takip numarası
            e-posta ile bildirilecektir. Kargo firmasının sitesinden veya
            uygulamasından teslimatınızı anlık olarak takip edebilirsiniz.
          </p>

          <h2>Eksik veya Hasarlı Teslimat</h2>
          <p>
            Kargonuz hasarlı veya eksik geldiğinde:
          </p>
          <ul>
            <li>
              Kargo teslim tutanağına &quot;hasarlı teslim alındı&quot; yazdırın ve
              kargo görevlisiyle tutanak tutun
            </li>
            <li>
              Hasarı fotoğraflayın (paket dışarıdan ve içeriden)
            </li>
            <li>
              En geç <strong>3 gün</strong> içinde bize bildirin
            </li>
          </ul>
          <p>
            Bu süreç tamamlandıktan sonra ücretsiz yeniden gönderim veya
            tam iade yapılacaktır.
          </p>

          <div className={styles.divider} />

          <p>
            İade ve değişim için{" "}
            <Link href="/iade-ve-iptal">İade &amp; İptal Politikamızı</Link> inceleyebilirsiniz.
          </p>
        </div>

        <Link href="/" className={styles.backLink}>
          ← Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  );
}
