import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "KVKK Aydınlatma Metni",
  description:
    "6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında Çiftçi Ece aydınlatma metni.",
  robots: { index: true, follow: true },
};

export default function KvkkPage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <nav className={styles.breadcrumb} aria-label="Sayfa yolu">
            <Link href="/">Ana Sayfa</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">KVKK Aydınlatma Metni</span>
          </nav>
          <span className={styles.category}>Yasal</span>
          <h1 className={styles.title}>KVKK Aydınlatma Metni</h1>
          <p className={styles.meta}>Son güncelleme: Eylül 2026</p>
        </header>

        <div className={styles.content}>
          <div className={styles.infoBox}>
            <p>
              Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu&apos;nun 10.
              maddesi uyarınca <strong>Çiftçi Ece</strong> tarafından veri
              sahiplerine (siz müşterilerimize) sunulan resmi aydınlatma metnidir.
            </p>
          </div>

          <h2>1. Veri Sorumlusunun Kimliği</h2>
          <p>
            <strong>Ticaret Unvanı:</strong> Çiftçi Ece<br />
            <strong>Adres:</strong> Muradiye, Zeytinciler Çarşısı, 16800 Orhangazi / Bursa
          </p>

          <h2>2. İşlenen Kişisel Veriler ve İşleme Amaçları</h2>

          <table className={styles.table}>
            <thead>
              <tr>
                <th>Veri Kategorisi</th>
                <th>Örnekler</th>
                <th>İşleme Amacı</th>
                <th>Hukuki Dayanak</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Kimlik</td>
                <td>Ad, soyad</td>
                <td>Sipariş oluşturma, teslimat</td>
                <td>Sözleşmenin ifası</td>
              </tr>
              <tr>
                <td>İletişim</td>
                <td>E-posta, telefon, adres</td>
                <td>Sipariş bildirimi, kargo takibi</td>
                <td>Sözleşmenin ifası</td>
              </tr>
              <tr>
                <td>Finans</td>
                <td>Sipariş tutarı, ödeme yöntemi türü</td>
                <td>Fatura düzenleme, muhasebe</td>
                <td>Yasal yükümlülük (VUK)</td>
              </tr>
              <tr>
                <td>İşlem</td>
                <td>Sipariş geçmişi, sepet içeriği</td>
                <td>Hizmet sunumu, iade yönetimi</td>
                <td>Sözleşmenin ifası</td>
              </tr>
              <tr>
                <td>Teknik</td>
                <td>IP adresi, çerezler</td>
                <td>Site güvenliği, hata tespiti</td>
                <td>Meşru menfaat</td>
              </tr>
            </tbody>
          </table>

          <h2>3. Kişisel Verilerin Aktarılabileceği Taraflar ve Amaçları</h2>
          <p>
            İşlenen kişisel verileriniz yalnızca aşağıdaki kategori alıcılara
            ve belirtilen amaçlarla aktarılabilmektedir:
          </p>
          <ul>
            <li>
              <strong>Kargo/Lojistik Şirketleri:</strong> Siparişinizin teslimatını
              gerçekleştirmek amacıyla ad, soyad, adres ve telefon bilgileri
              iletilmektedir.
            </li>
            <li>
              <strong>Ödeme Hizmeti Sağlayıcıları (İyzico vb.):</strong> Ödeme
              işlemini güvenli şekilde gerçekleştirmek için gerekli bilgiler
              iletilmektedir. Kart bilgileriniz ödeme sağlayıcısında işlenir,
              bizim sistemlerimizde saklanmaz.
            </li>
            <li>
              <strong>Kamu Kurumları ve Yargı Mercileri:</strong> Yasal yükümlülük
              halinde ilgili resmi makamlara bilgi verilmektedir.
            </li>
          </ul>

          <h2>4. Kişisel Veri Toplamanın Yöntemi</h2>
          <p>
            Kişisel verileriniz; web sitemizde sipariş formu, iletişim formu
            doldurulması ve çerezler aracılığıyla elektronik ortamda toplanmaktadır.
          </p>

          <h2>5. Kişisel Veri Sahibinin Hakları (Madde 11)</h2>
          <p>
            KVKK&apos;nın 11. maddesi uyarınca veri sorumlusuna başvurarak
            aşağıdaki haklarınızı kullanabilirsiniz:
          </p>
          <ul>
            <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li>
            <li>İşlenmişse buna ilişkin bilgi talep etme</li>
            <li>İşlenme amacını öğrenme ve bu amaçlara uygun kullanılıp kullanılmadığını öğrenme</li>
            <li>Yurt içi veya yurt dışındaki aktarılan üçüncü kişileri bilme</li>
            <li>Eksik veya yanlış işlenmiş verilerin düzeltilmesini isteme</li>
            <li>KVKK&apos;da öngörülen koşullarda kişisel verilerin silinmesini isteme</li>
            <li>
              Düzeltme ve silme işlemlerinin aktarılan üçüncü kişilere bildirilmesini isteme
            </li>
            <li>
              Otomatik sistemler aracılığıyla kişilik aleyhine sonuç doğuran kararlara
              itiraz etme
            </li>
            <li>
              Kanuna aykırı işleme nedeniyle zarara uğranılması halinde zararın
              tazminini talep etme
            </li>
          </ul>

          <h2>6. Başvuru Hakkı ve Yöntemi</h2>
          <p>
            Haklarınızı kullanmak için yazılı başvurunuzu aşağıdaki adrese
            posta veya kargo ile iletebilirsiniz. Başvurular en geç{" "}
            <strong>30 gün</strong> içinde yanıtlanacaktır.
          </p>
          <p>
            Kişisel Veri Başvuru Formu ile başvurunuzu detaylı şekilde
            iletmenizi tavsiye ederiz.
          </p>

          <div className={styles.contactCard}>
            <h3>Başvuru Adresi</h3>
            <p>
              <strong>Çiftçi Ece — KVKK Sorumlusu</strong>
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
