import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Çerez Politikası",
  description:
    "Çiftçi Ece çerez politikası — web sitemizde kullanılan çerezler hakkında bilgi.",
  robots: { index: true, follow: true },
};

export default function CerezPolitikasiPage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <nav className={styles.breadcrumb} aria-label="Sayfa yolu">
            <Link href="/">Ana Sayfa</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Çerez Politikası</span>
          </nav>
          <span className={styles.category}>Yasal</span>
          <h1 className={styles.title}>Çerez Politikası</h1>
          <p className={styles.meta}>Son güncelleme: Eylül 2026</p>
        </header>

        <div className={styles.content}>
          <div className={styles.infoBox}>
            <p>
              Bu politika, <strong>ciftciece.com</strong> web sitesinde
              kullanılan çerezleri (cookie) ve benzer teknolojileri, bunların
              amaçlarını ve yönetim seçeneklerini açıklamaktadır.
            </p>
          </div>

          <h2>1. Çerez Nedir?</h2>
          <p>
            Çerezler, web sitelerinin tarayıcınıza yerleştirdiği küçük metin
            dosyalarıdır. Siteyi bir sonraki ziyaretinizde sizi tanımak,
            tercihlerinizi hatırlamak ve kullanıcı deneyimini iyileştirmek
            amacıyla kullanılırlar.
          </p>

          <h2>2. Kullandığımız Çerez Türleri</h2>

          <h3>a) Zorunlu Çerezler</h3>
          <p>
            Web sitesinin temel işlevlerinin çalışması için gereklidir. Bu
            çerezler olmadan alışveriş sepeti, oturum yönetimi ve güvenlik
            işlevleri çalışmaz. Onayınıza gerek kalmaksızın yerleştirilirler.
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Çerez Adı</th>
                <th>Amaç</th>
                <th>Süre</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>session</td>
                <td>Oturum güvenliği</td>
                <td>Tarayıcı kapanınca</td>
              </tr>
              <tr>
                <td>cart_id</td>
                <td>Alışveriş sepeti kimliği</td>
                <td>30 gün</td>
              </tr>
              <tr>
                <td>csrf_token</td>
                <td>Güvenlik token&apos;ı</td>
                <td>Tarayıcı kapanınca</td>
              </tr>
            </tbody>
          </table>

          <h3>b) İşlevsel Çerezler</h3>
          <p>
            Dil tercihi gibi kullanıcı seçimlerini hatırlamak için kullanılır.
            Zorunlu değildir ancak kullanıcı deneyimini iyileştirir.
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Çerez Adı</th>
                <th>Amaç</th>
                <th>Süre</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>locale</td>
                <td>Dil tercihi</td>
                <td>1 yıl</td>
              </tr>
              <tr>
                <td>cookie_consent</td>
                <td>Çerez tercih kaydı</td>
                <td>1 yıl</td>
              </tr>
            </tbody>
          </table>

          <h3>c) Analiz Çerezleri</h3>
          <p>
            Web sitemizin nasıl kullanıldığını anlamak ve iyileştirmek amacıyla
            ziyaret istatistikleri toplanır. Bu çerezler kişisel kimlik
            bilgisi içermez; anonimleştirilmiş istatistik verisi üretir.
            Açık onayınıza dayanır.
          </p>

          <h2>3. Üçüncü Taraf Çerezler</h2>
          <p>
            Web sitemiz, ödeme işlemleri sırasında İyzico gibi ödeme
            sağlayıcılarının çerezlerine izin verebilir. Bu çerezlere ilişkin
            politika ilgili sağlayıcının gizlilik politikasında bulunmaktadır.
          </p>

          <h2>4. Çerezleri Yönetmek</h2>
          <p>
            Tarayıcınızın ayarlarından çerezleri silebilir veya engelleyebilirsiniz.
            Ancak zorunlu çerezlerin engellenmesi durumunda site işlevleri
            (sepet, oturum vb.) çalışmayabilir.
          </p>
          <p>Popüler tarayıcılar için çerez ayarları:</p>
          <ul>
            <li>
              <strong>Chrome:</strong> Ayarlar → Gizlilik ve güvenlik → Çerezler
            </li>
            <li>
              <strong>Firefox:</strong> Seçenekler → Gizlilik ve Güvenlik
            </li>
            <li>
              <strong>Safari:</strong> Tercihler → Gizlilik → Çerezleri ve web sitesi verilerini yönet
            </li>
            <li>
              <strong>Edge:</strong> Ayarlar → Çerezler ve site izinleri
            </li>
          </ul>

          <h2>5. Politika Değişiklikleri</h2>
          <p>
            Bu politika gerektiğinde güncellenebilir. Önemli değişiklikler
            web sitemizde duyurulacaktır.
          </p>

          <div className={styles.divider} />

          <p>
            Gizlilik ile ilgili daha fazla bilgi için{" "}
            <Link href="/gizlilik">Gizlilik Politikamızı</Link> inceleyin.
          </p>
        </div>

        <Link href="/" className={styles.backLink}>
          ← Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  );
}
