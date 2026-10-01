import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Kullanım Koşulları",
  description:
    "Çiftçi Ece web sitesi kullanım koşulları — siteyi kullanarak kabul ettiğiniz kurallar.",
  robots: { index: true, follow: true },
};

export default function KullanimKosullariPage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <nav className={styles.breadcrumb} aria-label="Sayfa yolu">
            <Link href="/">Ana Sayfa</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Kullanım Koşulları</span>
          </nav>
          <span className={styles.category}>Yasal</span>
          <h1 className={styles.title}>Kullanım Koşulları</h1>
          <p className={styles.meta}>Son güncelleme: Eylül 2026</p>
        </header>

        <div className={styles.content}>
          <div className={styles.infoBox}>
            <p>
              <strong>ciftciece.com</strong> web sitesini ziyaret ederek veya
              kullanarak bu kullanım koşullarını kabul etmiş sayılırsınız. Lütfen
              dikkatlice okuyunuz.
            </p>
          </div>

          <h2>1. Genel</h2>
          <p>
            Bu kullanım koşulları; <strong>Çiftçi Ece</strong> tarafından işletilen{" "}
            <strong>ciftciece.com</strong> web sitesinin kullanım esaslarını
            düzenler. Siteyi kullanmaya devam etmeniz bu koşulları
            kabul ettiğiniz anlamına gelir.
          </p>

          <h2>2. Hizmetin Kapsamı</h2>
          <p>
            Web sitemiz üzerinden Çiftçi Ece tarafından sunulan ürünleri
            inceleyebilir, sepete ekleyebilir ve satın alabilirsiniz.
            Site; zeytin, zeytinyağı, turşu ve doğal ürünlerin tanıtım
            ve satış platformu olarak hizmet vermektedir.
          </p>

          <h2>3. Kullanıcı Yükümlülükleri</h2>
          <p>Siteyi kullanırken aşağıdaki kurallara uymayı kabul edersiniz:</p>
          <ul>
            <li>Siteyi yalnızca hukuka uygun amaçlarla kullanmak</li>
            <li>
              Başkalarının haklarını ihlal edecek, rahatsız edecek veya zarar
              verecek şekilde davranmamak
            </li>
            <li>
              Siteye yetkisiz erişim girişiminde bulunmamak, site altyapısını
              bozmaya çalışmamak
            </li>
            <li>
              Sahte sipariş oluşturmamak veya yanıltıcı bilgi vermemek
            </li>
            <li>
              Sipariş esnasında gerçek ve güncel iletişim bilgisi sağlamak
            </li>
          </ul>

          <h2>4. Ürün Bilgileri ve Fiyatlar</h2>
          <p>
            Ürün açıklamaları ve görselleri doğru bilgi sunmak amacıyla
            hazırlanmıştır. Bununla birlikte ürün ambalajı, içerik veya
            görsel farklılıklar önceden bildirim yapılmaksızın değişebilir.
          </p>
          <p>
            Fiyatlar Türk Lirası (TRY) cinsinden belirtilmiş olup KDV
            dahildir. Ürün fiyatları önceden haber verilmeksizin değişebilir;
            ancak sipariş onaylandıktan sonra fiyat değişikliği geçerli olmaz.
          </p>

          <h2>5. Fikri Mülkiyet</h2>
          <p>
            Bu web sitesindeki tüm içerikler (metin, görsel, logo, tasarım,
            kod) Çiftçi Ece&apos;ye aittir veya lisanslı olarak kullanılmaktadır.
            İçeriklerin izinsiz kopyalanması, dağıtılması veya ticari amaçlarla
            kullanılması yasaktır.
          </p>

          <h2>6. Gizlilik</h2>
          <p>
            Kişisel verilerinizin işlenmesi hakkında bilgi almak için{" "}
            <Link href="/gizlilik">Gizlilik Politikamızı</Link> ve{" "}
            <Link href="/kvkk">KVKK Aydınlatma Metnimizi</Link> inceleyiniz.
          </p>

          <h2>7. Hizmet Kesintileri</h2>
          <p>
            Site bakım, güncelleme veya teknik arızalar nedeniyle zaman zaman
            geçici olarak erişime kapatılabilir. Olası kesintilerden
            kaynaklanan zararlardan sorumluluğumuz sınırlıdır.
          </p>

          <h2>8. Üçüncü Taraf Bağlantılar</h2>
          <p>
            Web sitemiz, üçüncü taraf web sitelerine bağlantılar içerebilir.
            Bu sitelerin içerik ve gizlilik politikalarından sorumlu değiliz.
          </p>

          <h2>9. Sorumluluk Sınırlaması</h2>
          <p>
            Çiftçi Ece; yanlış kullanım, teknik arızalar veya internet
            bağlantısı sorunlarından kaynaklanan dolaylı zararlardan
            sorumlu tutulamaz. Ürünle ilgili doğrudan şikayetler için
            yasal haklarınızı kullanabilirsiniz.
          </p>

          <h2>10. Koşulların Değiştirilmesi</h2>
          <p>
            Bu kullanım koşulları önceden haber verilmeksizin güncellenebilir.
            Güncel koşullar her zaman bu sayfada yayımlanır. Siteyi
            kullanmaya devam etmeniz güncel koşulları kabul ettiğiniz
            anlamına gelir.
          </p>

          <h2>11. Uygulanacak Hukuk</h2>
          <p>
            Bu koşullar Türkiye Cumhuriyeti hukukuna tabi olup Bursa
            mahkemeleri yetkilidir.
          </p>

          <h2>12. İletişim</h2>
          <p>
            Kullanım koşullarına ilişkin sorularınız için:
          </p>

          <div className={styles.contactCard}>
            <h3>İletişim</h3>
            <p>
              <strong>Çiftçi Ece</strong>
            </p>
            <p>Muradiye, Zeytinciler Çarşısı</p>
            <p>16800 Orhangazi / Bursa</p>
          </div>
        </div>

        <Link href="/" className={styles.backLink}>
          ← Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  );
}
