import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Mesafeli Satış Sözleşmesi",
  description:
    "Çiftçi Ece mesafeli satış sözleşmesi — 6502 sayılı Tüketicinin Korunması Hakkında Kanun uyarınca.",
  robots: { index: true, follow: true },
};

export default function MesafeliSatisSozlesmesiPage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <nav className={styles.breadcrumb} aria-label="Sayfa yolu">
            <Link href="/">Ana Sayfa</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Mesafeli Satış Sözleşmesi</span>
          </nav>
          <span className={styles.category}>Yasal</span>
          <h1 className={styles.title}>Mesafeli Satış Sözleşmesi</h1>
          <p className={styles.meta}>
            6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli
            Sözleşmeler Yönetmeliği uyarınca
          </p>
        </header>

        <div className={styles.content}>
          <h2>MADDE 1 — TARAFLAR</h2>

          <h3>Satıcı</h3>
          <p>
            <strong>Unvan:</strong> Çiftçi Ece<br />
            <strong>Adres:</strong> Muradiye, Zeytinciler Çarşısı, 16800 Orhangazi / Bursa<br />
            <strong>Web Sitesi:</strong> ciftciece.com
          </p>

          <h3>Alıcı</h3>
          <p>
            Web sitemiz üzerinden sipariş veren kişi (bundan böyle{" "}
            <strong>&quot;Müşteri&quot;</strong> veya <strong>&quot;Alıcı&quot;</strong> olarak
            anılacaktır).
          </p>

          <h2>MADDE 2 — KONU</h2>
          <p>
            İşbu Mesafeli Satış Sözleşmesi; Alıcı&apos;nın, Satıcı&apos;ya ait
            internet sitesi üzerinden elektronik ortamda siparişini verdiği,
            sözleşmede belirtilen niteliklere sahip ürün/ürünlerin satışı ve
            teslimatına ilişkin olarak 6502 sayılı Tüketicinin Korunması Hakkında
            Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümleri gereğince
            tarafların hak ve yükümlülüklerini düzenler.
          </p>

          <h2>MADDE 3 — SÖZLEŞME KONUSU ÜRÜN</h2>
          <p>
            Alıcı&apos;nın sipariş verdiği ürünlere ilişkin temel özellikler (tür,
            miktar, marka/model, renk, adet, satış bedeli, ödeme şekli ve
            teslimat bilgileri) sipariş özet sayfasında ve sipariş onayı
            e-postasında yer almaktadır. İşbu sözleşme, belirtilen sipariş
            bilgilerini de kapsar.
          </p>

          <h2>MADDE 4 — GENEL HÜKÜMLER</h2>
          <ul>
            <li>
              Alıcı, sözleşme konusu ürün/hizmetin temel nitelikleri, satış
              fiyatı, ödeme şekli ve teslimat bilgilerini elektronik ortamda
              teyit ettiğini beyan eder.
            </li>
            <li>
              Sözleşme konusu ürün, yasal 30 günlük süreyi aşmamak şartı ile
              Alıcı&apos;nın sipariş özeti sayfasında belirtilen teslimat süresi
              içinde teslim edilir.
            </li>
            <li>
              Sözleşme konusu ürün, Alıcı&apos;dan başka bir kişi/kuruluşa
              teslim edilecek ise, teslim edilecek kişi/kuruluşun teslimatı
              kabul etmemesi halinde Satıcı sorumlu tutulamaz.
            </li>
            <li>
              Satıcı, sözleşme konusu ürünün sağlam, eksiksiz, siparişte
              belirtilen niteliklere uygun teslim edilmesinden sorumludur.
            </li>
            <li>
              Sözleşme konusu ürünün teslimatı için işbu sözleşmenin bedelinin
              Alıcı&apos;nın tercih ettiği ödeme şekliyle ödenmiş olması
              şarttır. Herhangi bir nedenle ürün bedeli ödenmez veya banka
              kayıtlarında iptal edilir ise, Satıcı ürünün teslimi
              yükümlülüğünden kurtulmuş kabul edilir.
            </li>
          </ul>

          <h2>MADDE 5 — CAYMA HAKKI</h2>
          <p>
            Alıcı, sözleşme konusu ürünün kendisine veya gösterdiği adresteki
            kişi/kuruluşa tesliminden itibaren <strong>14 (on dört) gün</strong>{" "}
            içinde, herhangi bir gerekçe göstermeksizin ve cezai şart
            ödemeksizin sözleşmeden cayma hakkına sahiptir.
          </p>
          <p>
            Cayma hakkının kullanılması için söz konusu süre içinde Satıcı&apos;ya
            yazılı bildirim yapılması zorunludur.
          </p>

          <h3>Cayma Hakkının İstisnaları</h3>
          <p>
            Aşağıdaki ürünlerde 14 günlük cayma hakkı uygulanmaz:
          </p>
          <ul>
            <li>
              Fiyatı finansal piyasalardaki dalgalanmalara bağlı olarak değişen
              ve Satıcı&apos;nın kontrolünde olmayan ürünler
            </li>
            <li>
              Alıcı&apos;nın istekleri veya açıkça onun kişisel ihtiyaçları
              doğrultusunda hazırlanan ürünler
            </li>
            <li>
              <strong>
                Gıda gibi çabuk bozulabilen veya son kullanma tarihi geçebilecek
                ürünler (taze zeytin, zeytinyağı vb. gıda ürünleri)
              </strong>
            </li>
            <li>
              Tesliminden sonra ambalaj, bant, mühür, paket gibi koruyucu
              unsurları açılmış olan ürünler (hijyen açısından iadesi uygun
              olmayan ürünler)
            </li>
          </ul>

          <div className={styles.infoBox}>
            <p>
              <strong>Önemli:</strong> Zeytinyağı ve ambalajı açılmış zeytin
              ürünleri, gıda güvenliği nedeniyle cayma hakkı kapsamı dışındadır.
              Ambalajı açılmamış ürünlerde cayma hakkı geçerlidir.
            </p>
          </div>

          <h2>MADDE 6 — ÖDEME</h2>
          <p>
            Ödeme, sipariş tamamlanırken seçilen yöntemle (kredi/banka kartı,
            havale/EFT veya sunulduğu siparişlerde kapıda ödeme) gerçekleştirilir. Kart bilgileri bankacılık
            altyapısı üzerinden işlenir; Satıcı&apos;nın sistemlerinde saklanmaz.
            3D Secure doğrulaması kullanılmaktadır.
          </p>

          <h2>MADDE 7 — TESLİMAT</h2>
          <ul>
            <li>Teslimat, sipariş onayından itibaren en geç 30 iş günü içinde yapılır.</li>
            <li>
              Stok tükenmesi veya beklenmeyen durumlar halinde Alıcı bilgilendirilir
              ve sipariş iptal edilerek ödeme iade edilir.
            </li>
            <li>
              Kargo bedeli, ödeme sayfasında sipariş öncesi Alıcı&apos;ya
              bildirilir.
            </li>
          </ul>

          <h2>MADDE 8 — UYUŞMAZLIKLARIN ÇÖZÜMÜ</h2>
          <p>
            İşbu sözleşmeden kaynaklanan uyuşmazlıklarda; şikâyet ve itirazlar,
            ürünün satın alındığı veya Alıcı&apos;nın yerleşim yerindeki Tüketici
            Hakem Heyeti veya Tüketici Mahkemesi&apos;ne yapılabilir. Değer sınırları
            için Gümrük ve Ticaret Bakanlığı tarafından her yıl belirlenen değerler
            esas alınır.
          </p>

          <h2>MADDE 9 — YÜRÜRLÜK</h2>
          <p>
            Alıcı, sipariş formunu tamamlayarak ve ödemeyi gerçekleştirerek
            işbu sözleşmenin tüm hükümlerini okuduğunu, anladığını ve kabul
            ettiğini beyan eder. Sözleşme, sipariş onayının Alıcı tarafından
            elektronik ortamda teyit edildiği an yürürlüğe girer.
          </p>
        </div>

        <Link href="/" className={styles.backLink}>
          ← Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  );
}
