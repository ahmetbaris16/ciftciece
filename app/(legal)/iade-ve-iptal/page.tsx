import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/legal/LegalPage";
import LegalSections from "@/components/legal/LegalSections";
import SellerContact from "@/components/legal/SellerContact";
import { getBusinessInfo } from "@/lib/business/business.repository";
import { DELIVERY_TERMS, withdrawalFormSections } from "@/lib/legal/content";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "İade ve İptal",
  description: "Sipariş iptali, cayma hakkı (14 gün), iade süreci, iade süreleri ve cayma formu.",
  robots: { index: true, follow: true },
};

export const revalidate = 300;

export default async function IadeVeIptalPage() {
  const business = await getBusinessInfo();
  return (
    <LegalPage title="İade ve İptal" category="Müşteri Hizmetleri" updated="2026-10-02">
      <div className={styles.infoBox}>
        <p>
          Bir sorun olursa çözmek bizim işimiz. Talebinizi sipariş sayfanızdaki <strong>“İade / iptal”</strong> bölümünden
          birkaç saniyede iletebilirsiniz; talebiniz kayda geçer ve size e-postayla bilgi veririz.
        </p>
      </div>

      <h2>1. Siparişi iptal etmek</h2>
      <ul>
        <li>
          <strong>Ödemesi henüz yapılmamış sipariş</strong> (ör. havale bekleyen): sipariş sayfanızdan tek tıkla iptal
          edebilirsiniz; ayrılan ürünler hemen serbest kalır.
        </li>
        <li>
          <strong>Ödenmiş ama kargoya verilmemiş sipariş:</strong> sipariş sayfanızdan iptal isteği gönderin. Siparişi iptal
          eder, ödediğiniz tutarın tamamını ödeme yönteminize iade ederiz.
        </li>
        <li>
          <strong>Kargoya verilmiş sipariş:</strong> kargo geri çağrılamayabilir; ürün size ulaşınca cayma hakkınızı
          kullanabilirsiniz (aşağıda).
        </li>
      </ul>

      <h2>2. Cayma hakkı (14 gün)</h2>
      <p>
        Ürün size ya da gösterdiğiniz kişiye teslim edildiği günden itibaren <strong>14 gün</strong> içinde, gerekçe
        göstermeden ve ceza ödemeden sözleşmeden cayabilirsiniz. Cayma hakkını teslimattan önce de kullanabilirsiniz.
      </p>
      <h3>Cayma hakkının olmadığı durumlar</h3>
      <ul>
        <li>Ambalajı, bandı ya da mührü açılmış gıda ürünleri (zeytin, zeytinyağı, turşu vb.) — sağlık ve hijyen nedeniyle</li>
        <li>Çabuk bozulabilen ya da son kullanma tarihi geçebilecek ürünler</li>
        <li>Sizin isteğinize göre hazırlanan ürünler</li>
      </ul>
      <p>
        <strong>Ambalajı açılmamış, hasarsız ürünlerde cayma hakkınız geçerlidir.</strong>
      </p>

      <h2>3. İade nasıl yapılır</h2>
      <ol>
        <li>
          <strong>Bildirin:</strong> sipariş sayfanızdaki “İade / cayma bildirimi” formunu kullanın ya da aşağıdaki cayma
          formunu doldurup e-postayla gönderin. Bildirim 14 gün içinde bize ulaşmalı.
        </li>
        <li>
          <strong>Gönderin:</strong> bildirimden itibaren 10 gün içinde ürünü {DELIVERY_TERMS.returnCarrier} ile, size
          vereceğimiz iade koduyla gönderin. Bu şekilde gönderilen cayma iadelerinde kargo ücreti bize aittir.
        </li>
        <li>
          <strong>Paranız iade edilir:</strong> cayma bildiriminiz bize ulaştıktan sonra <strong>en geç 14 gün</strong> içinde,
          kargo ücreti dahil ödediğiniz tutarın tamamı ödeme yönteminize (kartınıza ya da hesabınıza) tek seferde iade edilir.
          Kartınıza yansıma süresi bankanıza göre değişebilir. İade yapıldığında size e-posta göndeririz.
        </li>
      </ol>

      <h2>4. Hasarlı, eksik ya da yanlış ürün</h2>
      <p>
        Paket hasarlıysa kargo görevlisine tutanak tutturun, fotoğraf çekin ve en kısa sürede bize bildirin. Hasarlı, eksik
        ya da yanlış gönderilen üründe yasal seçimlik haklarınız (değişim, iade, bedel indirimi) saklıdır; kargo ücretleri
        bize aittir.
      </p>

      <h2>5. Cayma formu</h2>
      <p>Mesafeli Sözleşmeler Yönetmeliği ekindeki forma göre hazırlanmıştır; doldurup e-postayla gönderebilirsiniz.</p>
      <LegalSections sections={withdrawalFormSections(business)} compact />

      <h2>6. İletişim</h2>
      <SellerContact business={business} />
      <p>
        Haklarınızın tamamı: <Link href="/mesafeli-satis-sozlesmesi">Mesafeli Satış Sözleşmesi</Link> ve{" "}
        <Link href="/on-bilgilendirme">Ön Bilgilendirme Formu</Link>.
      </p>
    </LegalPage>
  );
}
