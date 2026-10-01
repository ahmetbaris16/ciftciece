import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "İade & İptal Politikası",
  description:
    "Çiftçi Ece iade ve iptal politikası — Hangi ürünleri iade edebilirsiniz, süreç nasıl işler.",
  robots: { index: true, follow: true },
};

export default function IadeVeIptalPage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <nav className={styles.breadcrumb} aria-label="Sayfa yolu">
            <Link href="/">Ana Sayfa</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">İade &amp; İptal</span>
          </nav>
          <span className={styles.category}>Müşteri Hizmetleri</span>
          <h1 className={styles.title}>İade &amp; İptal Politikası</h1>
          <p className={styles.meta}>Son güncelleme: Eylül 2026</p>
        </header>

        <div className={styles.content}>
          <div className={styles.infoBox}>
            <p>
              Müşteri memnuniyeti bizim için her şeyden önce gelir. Herhangi bir
              sorunuz veya sorununuz olursa lütfen bizimle iletişime geçin —
              birlikte en iyi çözümü buluruz.
            </p>
          </div>

          <h2>Sipariş İptali</h2>

          <h3>Kargoya Çıkmadan Önce</h3>
          <p>
            Siparişiniz henüz kargoya verilmemişse, iptal talebinizi
            iletmeniz durumunda siparişinizi ücretsiz olarak iptal edebiliriz.
            Ödemeniz, bankanıza bağlı olarak{" "}
            <strong>3-14 iş günü</strong> içinde kartınıza iade edilir.
          </p>

          <h3>Kargoya Verildikten Sonra</h3>
          <p>
            Kargoya verilen siparişler, kargo firmasının politikaları gereği
            geri çağrılamayabilir. Ürün elinize ulaştıktan sonra iade
            prosedürünü başlatabilirsiniz.
          </p>

          <h2>İade Koşulları</h2>

          <h3>İade Edilebilen Ürünler</h3>
          <ul>
            <li>
              <strong>Ambalajı açılmamış</strong> ürünler — teslimden itibaren
              14 gün içinde
            </li>
            <li>
              Hasarlı/kırık ulaşan ürünler (fotoğraf ile belgelenmesi gerekir)
            </li>
            <li>Yanlış ürün gönderilmesi halinde</li>
            <li>Sipariş edilen ürünle uyuşmayan kalite/içerik durumları</li>
          </ul>

          <h3>İade Edilemeyen Ürünler</h3>
          <ul>
            <li>
              <strong>
                Ambalajı açılmış gıda ürünleri
              </strong>{" "}
              (zeytin, zeytinyağı, turşu vb.) — gıda güvenliği ve hijyen
              nedeniyle
            </li>
            <li>
              Son kullanma tarihi geçmiş veya uygunsuz koşullarda saklanan ürünler
              (müşteri kaynaklı)
            </li>
            <li>
              14 günlük cayma süresini geçmiş talepler (hasarlı teslimat
              hariç)
            </li>
          </ul>

          <div className={styles.infoBox}>
            <p>
              <strong>Gıda ürünleri için önemli not:</strong> Zeytinyağı ve
              zeytin gibi gıda ürünlerinde ambalaj açıldıktan sonra iade
              mümkün değildir. Bu durum, 6502 sayılı Kanun kapsamındaki cayma
              hakkı istisnasına dayanmaktadır. Lütfen ambalajı açmadan önce
              ürünü kontrol edin.
            </p>
          </div>

          <h2>İade Süreci</h2>

          <h3>Adım 1 — Bize Ulaşın</h3>
          <p>
            İade talebinizi aşağıdaki iletişim bilgilerinden bize iletin.
            Lütfen sipariş numaranızı ve iade gerekçenizi belirtin. Hasarlı
            ürün durumunda fotoğraf paylaşın.
          </p>

          <h3>Adım 2 — Onay</h3>
          <p>
            Talebinizi inceleyip{" "}
            <strong>2 iş günü</strong> içinde size geri dönecek ve iade
            onayı veya reddi konusunda bilgi vereceğiz.
          </p>

          <h3>Adım 3 — Ürünü Gönderin</h3>
          <p>
            İade onayı alan ürünleri orijinal ambalajında, kırılmadan ve
            hasarsız şekilde aşağıdaki adrese gönderiniz. İade kargo bedeli
            aşağıdaki durumlarda <strong>Satıcı&apos;ya</strong> aittir:
          </p>
          <ul>
            <li>Yanlış ürün gönderilmesi</li>
            <li>Hasarlı/bozuk ürün teslimatı</li>
          </ul>
          <p>
            Cayma hakkı kapsamındaki iadelerde kargo bedeli{" "}
            <strong>müşteriye</strong> aittir.
          </p>

          <h3>Adım 4 — Para İadesi</h3>
          <p>
            Ürün bize ulaştıktan ve kontrol edildikten sonra ödeme iadesi{" "}
            <strong>5-14 iş günü</strong> içinde aynı ödeme yöntemiyle yapılır.
            Bankaya bağlı olarak kartınıza yansıma süresi farklılık gösterebilir.
          </p>

          <h2>İletişim</h2>

          <div className={styles.contactCard}>
            <h3>Yardım için bize ulaşın</h3>
            <p>
              <strong>Çiftçi Ece</strong>
            </p>
            <p>Muradiye, Zeytinciler Çarşısı</p>
            <p>16800 Orhangazi / Bursa</p>
            <p style={{ marginTop: "0.75rem" }}>
              Mağazamıza doğrudan gelerek de işlem yapabilirsiniz.
              Her gün <strong>07:00 – 00:00</strong> saatleri arasında açığız.
            </p>
          </div>

          <div className={styles.divider} />

          <p>
            Mesafeli satış haklarınız hakkında daha fazla bilgi için{" "}
            <Link href="/mesafeli-satis-sozlesmesi">
              Mesafeli Satış Sözleşmemizi
            </Link>{" "}
            inceleyebilirsiniz.
          </p>
        </div>

        <Link href="/" className={styles.backLink}>
          ← Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  );
}
