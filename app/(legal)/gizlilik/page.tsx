import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/legal/LegalPage";
import SellerContact from "@/components/legal/SellerContact";
import { getBusinessInfo } from "@/lib/business/business.repository";
import { sellerDisplayName } from "@/lib/business/info";

export const metadata: Metadata = {
  title: "Gizlilik Politikası",
  description: "Kişisel verilerinizi nasıl işlediğimiz, kimlerle paylaştığımız ve nasıl koruduğumuz.",
  robots: { index: true, follow: true },
};

export const revalidate = 300;

export default async function GizlilikPage() {
  const business = await getBusinessInfo();
  const seller = sellerDisplayName(business);
  return (
    <LegalPage title="Gizlilik Politikası" updated="2026-10-02">
      <p>
        Bu politika, <strong>{seller}</strong> olarak sitemizi ziyaret eden ve alışveriş yapan kişilerin kişisel verilerini
        nasıl işlediğimizi açıklar. Hukuki ayrıntı ve haklarınız: <Link href="/kvkk">KVKK Aydınlatma Metni</Link>.
      </p>

      <h2>1. Hangi verileri alıyoruz</h2>
      <ul>
        <li>Sipariş verirken: ad, soyad, e-posta, telefon, teslimat adresi; kurumsal faturada unvan ve vergi bilgileri; isteğe bağlı sipariş notu.</li>
        <li>Üye olursanız: ad, e-posta, telefon ve şifrenizin geri döndürülemez özeti (şifrenin kendisi saklanmaz).</li>
        <li>Siparişte onayladığınız sözleşmelerin sürümü, onay zamanı ve IP adresiniz (ispat için).</li>
        <li>İletişim ve iade/iptal formlarına yazdıklarınız.</li>
        <li>Güvenlik için sunucu kayıtları (IP adresi, istek zamanı).</li>
      </ul>
      <p>
        <strong>Kart bilgilerinizi almıyoruz.</strong> Kartla ödemede kart bilgileri bankanın (Akbank) 3D Secure güvenli
        ödeme sayfasında girilir; sitemize gelmez ve saklanmaz.
      </p>

      <h2>2. Ne için kullanıyoruz</h2>
      <ul>
        <li>Siparişinizi almak, hazırlamak, kargolamak ve faturalamak</li>
        <li>Siparişinizle ilgili e-posta göndermek: sipariş onayı ve sözleşmeler, ödeme, kargo takip numarası, teslimat, iptal/iade bilgisi</li>
        <li>İade, iptal ve şikâyet taleplerinizi yanıtlamak</li>
        <li>Yasal yükümlülüklerimizi yerine getirmek (vergi, tüketici mevzuatı)</li>
        <li>Siteyi güvenli tutmak</li>
      </ul>
      <p>
        Size <strong>reklam ya da kampanya e-postası göndermiyoruz</strong>. İleride gönderirsek bunu yalnız açık onayınızla,
        mevzuata (İYS) uygun olarak yaparız.
      </p>

      <h2>3. Kimlerle paylaşıyoruz</h2>
      <ul>
        <li>Yurtiçi Kargo — teslimat için ad, adres, telefon</li>
        <li>Akbank — kartlı ödemenin gerçekleşmesi için sipariş numarası ve tutar</li>
        <li>Hostinger — sitemizin, veritabanımızın ve e-postalarımızın barındırıldığı hizmet sağlayıcı (sunucular yurt dışında olabilir)</li>
        <li>OpenStreetMap — mağaza haritası görüntülendiğinde harita parçaları bu servisten yüklenir; tarayıcınızın IP adresini görür</li>
        <li>Mali müşavirimiz ve yetkili kamu kurumları — yasal yükümlülükler kapsamında</li>
      </ul>
      <p>Verilerinizi satmıyor, reklam amacıyla kimseyle paylaşmıyoruz.</p>

      <h2>4. Ne kadar saklıyoruz</h2>
      <p>
        Sipariş, fatura ve sözleşme kayıtları vergi ve ticaret mevzuatının gerektirdiği süre boyunca; üyelik bilgileri
        üyeliğiniz sürdükçe saklanır. Üyeliğinizin silinmesini istediğinizde, yasal saklama yükümlülüğü olan sipariş kayıtları
        dışındaki bilgileriniz silinir.
      </p>

      <h2>5. Güvenlik</h2>
      <ul>
        <li>Site yalnız şifreli bağlantıyla (HTTPS) çalışır.</li>
        <li>Şifreler geri döndürülemez biçimde (özet) saklanır.</li>
        <li>Yönetim paneline giriş sınırlıdır ve tekrarlanan hatalı girişler engellenir.</li>
        <li>Kart bilgileri sitemizden geçmez.</li>
      </ul>

      <h2>6. Çerezler</h2>
      <p>
        Yalnız sitenin çalışması için zorunlu çerezler kullanıyoruz (oturum ve güvenlik). Analiz ya da reklam çerezi yoktur.
        Ayrıntı: <Link href="/cerez-politikasi">Çerez Politikası</Link>.
      </p>

      <h2>7. Haklarınız ve iletişim</h2>
      <p>
        Verilerinize erişme, düzeltme ve silinmesini isteme haklarınız için <Link href="/kvkk">KVKK Aydınlatma Metni</Link>&apos;ne
        bakın; bize aşağıdan ulaşabilirsiniz.
      </p>
      <SellerContact business={business} />
    </LegalPage>
  );
}
