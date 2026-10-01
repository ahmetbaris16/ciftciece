import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Gizlilik Politikası",
  description:
    "Çiftçi Ece gizlilik politikası — kişisel verilerinizin nasıl toplandığı, kullanıldığı ve korunduğu hakkında bilgi.",
  robots: { index: true, follow: true },
};

export default function GizlilikPolitikasiPage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <nav className={styles.breadcrumb} aria-label="Sayfa yolu">
            <Link href="/">Ana Sayfa</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Gizlilik Politikası</span>
          </nav>
          <span className={styles.category}>Yasal</span>
          <h1 className={styles.title}>Gizlilik Politikası</h1>
          <p className={styles.meta}>Son güncelleme: Eylül 2026</p>
        </header>

        <div className={styles.content}>
          <div className={styles.infoBox}>
            <p>
              Bu politika, <strong>Çiftçi Ece</strong> (&quot;Satıcı&quot;, &quot;biz&quot;) olarak{" "}
              <strong>ciftciece.com</strong> web sitesini ziyaret eden ve alışveriş
              yapan kişilerin kişisel verilerini nasıl işlediğimizi açıklar.
              6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) ve ilgili
              mevzuat çerçevesinde hazırlanmıştır.
            </p>
          </div>

          <h2>1. Veri Sorumlusu</h2>
          <p>
            Kişisel verileriniz bakımından veri sorumlusu <strong>Çiftçi Ece</strong>
            &apos;dir. Adres: Muradiye, Zeytinciler Çarşısı, 16800 Orhangazi / Bursa.
          </p>

          <h2>2. Toplanan Veriler</h2>
          <p>
            Web sitemizi kullanmanız sırasında aşağıdaki kişisel veriler
            toplanabilir:
          </p>
          <h3>a) Sipariş ve İletişim Verileri</h3>
          <ul>
            <li>Ad, soyad</li>
            <li>E-posta adresi</li>
            <li>Telefon numarası</li>
            <li>Teslimat adresi (mahalle, sokak, ilçe, şehir, posta kodu)</li>
            <li>Sipariş geçmişi ve sipariş içeriği</li>
          </ul>

          <h3>b) Teknik Veriler</h3>
          <ul>
            <li>IP adresi</li>
            <li>Tarayıcı türü ve sürümü</li>
            <li>Ziyaret edilen sayfalar ve oturum süresi</li>
            <li>Cihaz türü</li>
            <li>Çerez (cookie) verileri</li>
          </ul>

          <h3>c) Ödeme Verileri</h3>
          <p>
            Kart bilgileri <strong>asla</strong> bizim sistemlerimizde saklanmaz.
            Ödeme işlemleri, PCI-DSS uyumlu ödeme sağlayıcıları (İyzico vb.)
            üzerinden gerçekleştirilir.
          </p>

          <h2>3. Verilerin Kullanım Amacı</h2>
          <p>Kişisel verileriniz aşağıdaki amaçlarla işlenmektedir:</p>
          <ul>
            <li>Siparişinizi oluşturmak, yönetmek ve teslim etmek</li>
            <li>Kargo ve teslimat süreçlerini yürütmek</li>
            <li>Ödeme işlemlerini gerçekleştirmek</li>
            <li>
              İade, değişim ve şikayet süreçlerini yönetmek (yasal yükümlülük)
            </li>
            <li>Sipariş onayı ve kargo bilgilendirme e-postaları göndermek</li>
            <li>Yasal yükümlülükleri yerine getirmek (vergi, muhasebe kayıtları)</li>
            <li>Site güvenliğini sağlamak ve hatalı işlemleri önlemek</li>
          </ul>

          <h2>4. Verilerin Aktarımı</h2>
          <p>
            Kişisel verileriniz; kargo firmaları, ödeme hizmeti sağlayıcıları ve
            yasal merciler dışında üçüncü taraflarla paylaşılmaz. Veriler
            yurt dışına aktarılmaz.
          </p>

          <h2>5. Saklama Süresi</h2>
          <p>
            Sipariş ve fatura bilgileri, vergi mevzuatı gereği{" "}
            <strong>5 yıl</strong> süreyle saklanır. Bu süre sonunda veriler
            güvenli şekilde imha edilir.
          </p>

          <h2>6. Güvenlik Önlemleri</h2>
          <p>
            Kişisel verilerinizi yetkisiz erişime, değişikliğe ve imhaya karşı
            korumak için SSL şifreleme, erişim kontrolleri ve düzenli güvenlik
            taramaları uygulanmaktadır.
          </p>

          <h2>7. Çerezler</h2>
          <p>
            Web sitemiz oturum çerezleri ve analiz çerezleri kullanmaktadır.
            Detaylı bilgi için{" "}
            <Link href="/cerez-politikasi">Çerez Politikamızı</Link> inceleyin.
          </p>

          <h2>8. Haklarınız</h2>
          <p>
            KVKK kapsamında aşağıdaki haklara sahipsiniz:
          </p>
          <ul>
            <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li>
            <li>İşlenmişse buna ilişkin bilgi talep etme</li>
            <li>Verilerin işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme</li>
            <li>Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme</li>
            <li>Eksik veya yanlış işlenmişse düzeltilmesini isteme</li>
            <li>Yasal koşulların sağlanması halinde silinmesini veya yok edilmesini isteme</li>
            <li>İşlemenin amaçla sınırlı olduğunu denetleme</li>
            <li>Otomatik sistemler aracılığıyla aleyhinize çıkan kararlara itiraz etme</li>
            <li>Kanuna aykırı işleme nedeniyle zarara uğramanız halinde zararın giderilmesini talep etme</li>
          </ul>

          <h2>9. Başvuru Yolu</h2>
          <p>
            Haklarınızı kullanmak için aşağıdaki iletişim kanallarını
            kullanabilirsiniz. Başvurunuz en geç 30 gün içinde yanıtlanacaktır.
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
