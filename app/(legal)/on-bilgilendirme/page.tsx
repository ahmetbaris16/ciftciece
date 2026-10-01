// Bu metin değişirse lib/legal/documents.ts içindeki sürümü güncelleyin: siparişte müşterinin
// onayladığı sürüm order_consents tablosuna oradan yazılır.
import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Ön Bilgilendirme Formu",
  description:
    "Çiftçi Ece ön bilgilendirme formu — Mesafeli Sözleşmeler Yönetmeliği gereği satın alma öncesi tüketici bilgilendirmesi.",
  robots: { index: true, follow: true },
};

export default function OnBilgilendirmePage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <nav className={styles.breadcrumb} aria-label="Sayfa yolu">
            <Link href="/">Ana Sayfa</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Ön Bilgilendirme Formu</span>
          </nav>
          <span className={styles.category}>Yasal</span>
          <h1 className={styles.title}>Ön Bilgilendirme Formu</h1>
          <p className={styles.meta}>
            Mesafeli Sözleşmeler Yönetmeliği Madde 5 uyarınca hazırlanmıştır
          </p>
        </header>

        <div className={styles.content}>
          <div className={styles.infoBox}>
            <p>
              Bu form, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve
              Mesafeli Sözleşmeler Yönetmeliği&apos;nin 5. maddesi uyarınca,
              sipariş vermeden önce tüketicilere sağlanması zorunlu olan
              bilgileri içermektedir.
            </p>
          </div>

          <h2>1. Satıcı Bilgileri</h2>
          <p>
            <strong>Unvan:</strong> Çiftçi Ece<br />
            <strong>Adres:</strong> Muradiye, Zeytinciler Çarşısı, 16800 Orhangazi / Bursa<br />
            <strong>Web Sitesi:</strong> ciftciece.com
          </p>

          <h2>2. Sözleşmenin Konusu Olan Ürün/Hizmet</h2>
          <p>
            Sipariş verilen ürünlere ilişkin temel özellikler (ürün adı, miktarı,
            ağırlığı, birim fiyatı ve toplam fiyat dahil KDV tutarı) sipariş
            özeti sayfasında ve e-posta onayında sunulmaktadır.
          </p>

          <h2>3. Ödeme, Teslimat ve İfaya İlişkin Bilgiler</h2>

          <h3>Ödeme</h3>
          <ul>
            <li>Kredi kartı / Banka kartı (3D Secure ile; kartın bankasına göre taksit seçenekleriyle)</li>
            <li>Havale / EFT (sipariş sonrası gösterilen süre içinde ödenmeyen sipariş iptal edilir)</li>
            <li>Kapıda ödeme (sunulduğu siparişlerde; varsa hizmet bedeli ödeme sayfasında toplama eklenerek gösterilir)</li>
          </ul>
          <p>
            Tüm ödemeler Türk Lirası (TRY) üzerinden gerçekleştirilmektedir.
            Kart bilgileri Satıcı sistemlerinde saklanmaz.
          </p>

          <h3>Teslimat</h3>
          <ul>
            <li>Sipariş onayından itibaren en geç <strong>30 iş günü</strong> içinde kargoya verilir.</li>
            <li>Gönderim Yurtiçi Kargo ile yapılır. Kargo bedeli siparişin ağırlığı ve paket boyutuna göre belirlenir ve ödeme sayfasında gösterilir.</li>
            <li>
              Stok tükenmesi veya mücbir sebep halinde müşteri bilgilendirilir;
              sipariş iptal edilirse ödeme 14 gün içinde iade edilir.
            </li>
          </ul>

          <h2>4. Cayma Hakkı</h2>
          <p>
            Tüketici, ürünün tesliminden itibaren <strong>14 gün</strong> içinde
            herhangi bir gerekçe göstermeksizin ve cezai şart ödemeksizin
            sözleşmeden cayabilir.
          </p>

          <h3>Cayma Hakkının Kullanılamayacağı Durumlar</h3>
          <p>
            Aşağıdaki durumlarda cayma hakkı kullanılamaz:
          </p>
          <ul>
            <li>
              <strong>Çabuk bozulan ya da son kullanma tarihi geçen mallar</strong>{" "}
              (taze zeytin, zeytinyağı ve benzeri gıda ürünleri bu kapsama girer)
            </li>
            <li>
              Tesliminden sonra ambalajı açılmış olan, iade edilmesi sağlık ve
              hijyen açısından uygun olmayan mallar
            </li>
            <li>Tüketicinin özel istekleri doğrultusunda üretilen ürünler</li>
          </ul>

          <div className={styles.infoBox}>
            <p>
              <strong>Dikkat:</strong> Ambalajı açılmış zeytin ve zeytinyağı ürünleri
              gıda güvenliği nedeniyle iade alınmamaktadır. Ambalajı açılmamış,
              hasarsız ürünlerde cayma hakkı geçerlidir.
            </p>
          </div>

          <h2>5. Cayma Hakkının Kullanılma Usulü</h2>
          <p>
            Cayma hakkını kullanmak için 14 günlük süre içinde Satıcı&apos;ya
            yazılı bildirimde bulunulması ve ürünün iade edilmesi gerekmektedir.
            Cayma bildirimini aşağıdaki adrese yazılı olarak iletebilirsiniz:
          </p>

          <div className={styles.contactCard}>
            <h3>Cayma Bildirimi İçin</h3>
            <p>
              <strong>Çiftçi Ece</strong>
            </p>
            <p>Muradiye, Zeytinciler Çarşısı</p>
            <p>16800 Orhangazi / Bursa</p>
          </div>

          <h2>6. Uyuşmazlık Çözümü</h2>
          <p>
            Şikâyet ve itirazlar için Tüketici Hakem Heyetleri ve Tüketici
            Mahkemelerine başvurulabilir. Ayrıca{" "}
            <strong>e-Devlet üzerinden Tüketici Bilgi Sistemi (TÜBİS)</strong>{" "}
            aracılığıyla şikâyet iletilebilir.
          </p>

          <h2>7. Ürün Güvenliği</h2>
          <p>
            Satışa sunulan tüm gıda ürünleri Türk Gıda Kodeksi kapsamında
            üretilmiş olup gerekli gıda güvenliği koşullarına uygundur.
          </p>
        </div>

        <Link href="/" className={styles.backLink}>
          ← Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  );
}
