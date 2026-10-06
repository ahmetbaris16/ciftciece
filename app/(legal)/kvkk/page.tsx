import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/legal/LegalPage";
import SellerContact from "@/components/legal/SellerContact";
import { getBusinessInfo } from "@/lib/business/business.repository";
import { sellerDisplayName } from "@/lib/business/info";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "KVKK Aydınlatma Metni",
  description: "6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında aydınlatma metni.",
  robots: { index: true, follow: true },
};

export const revalidate = 300;

export default async function KvkkPage() {
  const business = await getBusinessInfo();
  const seller = sellerDisplayName(business);
  return (
    <LegalPage title="KVKK Aydınlatma Metni" meta="6698 sayılı Kişisel Verilerin Korunması Kanunu md. 10 uyarınca" updated="2026-10-02">
      <p>
        Bu metin, kişisel verilerinizin veri sorumlusu sıfatıyla <strong>{seller}</strong> tarafından hangi amaçla, hangi
        hukuki sebeple, nasıl işlendiğini ve haklarınızı açıklar.
      </p>

      <h2>1. Veri sorumlusu</h2>
      <SellerContact business={business} title="Veri sorumlusu" />

      <h2>2. İşlenen veriler, amaçlar ve hukuki sebepler</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Veri</th>
            <th>Amaç</th>
            <th>Hukuki sebep (KVKK md. 5)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Ad, soyad, e-posta, telefon, teslimat ve fatura adresi; kurumsal faturada unvan, vergi dairesi ve no</td>
            <td>Siparişin alınması, ödemenin işlenmesi, kargolama, faturalama, sipariş bilgilendirmesi</td>
            <td>Sözleşmenin kurulması ve ifası; hukuki yükümlülük (vergi mevzuatı)</td>
          </tr>
          <tr>
            <td>Sipariş içeriği, tutarlar, ödeme yöntemi, ödeme sonucu (kart bilgisi değil)</td>
            <td>Siparişin yönetimi, iade/iptal, muhasebe, uyuşmazlıkların çözümü</td>
            <td>Sözleşmenin ifası; hukuki yükümlülük; bir hakkın tesisi ve korunması</td>
          </tr>
          <tr>
            <td>Sözleşme onayının zamanı, sürümü ve IP adresi</td>
            <td>Ön bilgilendirme ve mesafeli satış sözleşmesi onayının ispatı</td>
            <td>Hukuki yükümlülük; bir hakkın tesisi ve korunması</td>
          </tr>
          <tr>
            <td>Üyelik bilgileri (ad, e-posta, telefon, şifrenin geri döndürülemez özeti)</td>
            <td>Üyelik hesabı, sipariş geçmişi</td>
            <td>Sözleşmenin kurulması ve ifası</td>
          </tr>
          <tr>
            <td>Ürün değerlendirmeleri (puan, yorum); yayında adınız ve soyadınızın baş harfi görünür</td>
            <td>
              Ürünü satın alan müşterinin (üye hesabından ya da sipariş sayfasından) yazdığı değerlendirmenin ürün sayfasında
              yayımlanması
            </td>
            <td>Sözleşmenin kurulması ve ifası</td>
          </tr>
          <tr>
            <td>İletişim formu ve iade/iptal taleplerindeki bilgiler</td>
            <td>Talebinizin yanıtlanması</td>
            <td>Sözleşmenin ifası; meşru menfaat</td>
          </tr>
          <tr>
            <td>IP adresi, tarayıcı bilgisi, güvenlik kayıtları</td>
            <td>Site güvenliği, kötüye kullanımın (ör. çok sayıda hatalı giriş) önlenmesi</td>
            <td>Meşru menfaat</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>Kart bilgileriniz</strong> sitemizde işlenmez ve saklanmaz: kart numarası, son kullanma tarihi ve güvenlik kodu
        bankanın 3D Secure ödeme sayfasında girilir.
      </p>

      <h2>3. Aktarılan taraflar</h2>
      <ul>
        <li>
          <strong>Kargo firması (Yurtiçi Kargo):</strong> teslimat için ad, soyad, adres ve telefon.
        </li>
        <li>
          <strong>Ödeme kuruluşu (Akbank):</strong> kartlı ödemenin gerçekleştirilmesi için sipariş tutarı ve sipariş numarası;
          kart bilgileri doğrudan bankaya girilir.
        </li>
        <li>
          <strong>Barındırma ve e-posta hizmeti (Hostinger):</strong> site, veritabanı ve e-postalarımız bu hizmet
          sağlayıcının sunucularında tutulur. Sunucular yurt dışında bulunabilir; bu durumda verileriniz KVKK&apos;nın 9.
          maddesindeki şartlar çerçevesinde yurt dışına aktarılır.
        </li>
        <li>
          <strong>Mali müşavir ve kamu kurumları:</strong> faturalama ve yasal yükümlülükler kapsamında; yetkili makamların
          talebi hâlinde.
        </li>
      </ul>

      <h2>4. Toplama yöntemi</h2>
      <p>
        Verileriniz sitemizdeki sipariş, üyelik, iletişim ve talep formları ile oturum çerezleri aracılığıyla elektronik
        ortamda toplanır.
      </p>

      <h2>5. Saklama süresi</h2>
      <p>
        Sipariş, fatura ve sözleşme kayıtları vergi ve ticaret mevzuatının öngördüğü süreler boyunca saklanır. Üyelik
        bilgileri üyelik sürdükçe; iletişim mesajları talebiniz sonuçlandıktan sonra makul süre boyunca tutulur. Süresi
        dolan veriler silinir, yok edilir ya da anonim hâle getirilir.
      </p>

      <h2>6. Haklarınız (KVKK md. 11)</h2>
      <ul>
        <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme</li>
        <li>İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme</li>
        <li>Yurt içinde ya da yurt dışında aktarıldığı üçüncü kişileri bilme</li>
        <li>Eksik ya da yanlış işlenmişse düzeltilmesini, şartları varsa silinmesini ya da yok edilmesini isteme</li>
        <li>Bu işlemlerin aktarılan üçüncü kişilere bildirilmesini isteme</li>
        <li>Otomatik sistemlerle analiz sonucu aleyhinize bir sonuç çıkmasına itiraz etme</li>
        <li>Kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme</li>
      </ul>

      <h2>7. Başvuru</h2>
      <p>
        Başvurunuzu yukarıdaki adrese yazılı olarak{business.email ? <> ya da <a href={`mailto:${business.email}`}>{business.email}</a> adresine kayıtlı e-postanızdan</> : null}{" "}
        iletebilirsiniz{business.kepAddress ? <> (KEP: {business.kepAddress})</> : null}. Başvurunuz en geç 30 gün içinde
        ücretsiz yanıtlanır. Ayrıntı: <Link href="/gizlilik">Gizlilik Politikası</Link>.
      </p>
    </LegalPage>
  );
}
