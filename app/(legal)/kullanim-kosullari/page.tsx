import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/legal/LegalPage";
import SellerContact from "@/components/legal/SellerContact";
import { getBusinessInfo } from "@/lib/business/business.repository";
import { sellerDisplayName } from "@/lib/business/info";

export const metadata: Metadata = {
  title: "Kullanım Koşulları",
  description: "Sitenin kullanım koşulları.",
  robots: { index: true, follow: true },
};

export const revalidate = 300;

export default async function KullanimKosullariPage() {
  const business = await getBusinessInfo();
  const seller = sellerDisplayName(business);
  return (
    <LegalPage title="Kullanım Koşulları" updated="2026-10-02">
      <p>
        Bu koşullar, <strong>{seller}</strong> tarafından işletilen bu internet sitesinin kullanımını düzenler. Satın alma
        işlemleri ayrıca <Link href="/mesafeli-satis-sozlesmesi">Mesafeli Satış Sözleşmesi</Link>&apos;ne tabidir.
      </p>

      <h2>1. Hizmet</h2>
      <p>
        Sitede zeytin, zeytinyağı ve yöresel ürünlerimizi inceleyebilir, sepete ekleyebilir ve satın alabilirsiniz. Üye
        olmadan da sipariş verebilirsiniz; üyelik koşulları <Link href="/uyelik-sozlesmesi">Üyelik Sözleşmesi</Link>&apos;ndedir.
      </p>

      <h2>2. Ürün bilgileri ve fiyatlar</h2>
      <ul>
        <li>Fiyatlar Türk Lirası ve KDV dahildir. Kargo ücreti ödeme adımında, siparişi onaylamadan önce gösterilir.</li>
        <li>Ürün görselleri kendi ürünlerimizin fotoğraflarıdır; doğal ürünlerde renk ve boyutta küçük farklar olabilir.</li>
        <li>
          Fiyatlar önceden haber verilmeden değişebilir; onaylanmış siparişin fiyatı değişmez. Açık bir fiyat hatası olursa
          sizi bilgilendirir, siparişi sizin onayınızla düzeltir ya da ücretsiz iptal ederiz.
        </li>
      </ul>

      <h2>3. Kullanıcının yükümlülükleri</h2>
      <ul>
        <li>Siteyi hukuka uygun amaçlarla kullanmak, gerçek ve güncel bilgi vermek</li>
        <li>Siteye yetkisiz erişim girişiminde bulunmamak, işleyişini bozmamak</li>
        <li>Başkası adına izinsiz sipariş vermemek</li>
      </ul>

      <h2>4. Fikri mülkiyet</h2>
      <p>
        Sitedeki metin, fotoğraf, logo ve tasarımlar {seller}&apos;e aittir ya da izinle kullanılmaktadır; izinsiz
        kopyalanamaz, ticari amaçla kullanılamaz.
      </p>

      <h2>5. Kişisel veriler</h2>
      <p>
        Verilerinizin işlenmesi: <Link href="/gizlilik">Gizlilik Politikası</Link>,{" "}
        <Link href="/kvkk">KVKK Aydınlatma Metni</Link>, <Link href="/cerez-politikasi">Çerez Politikası</Link>.
      </p>

      <h2>6. Hizmet kesintileri</h2>
      <p>
        Bakım ya da teknik arıza nedeniyle site geçici olarak erişilemeyebilir. Bu sırada verilmiş siparişleriniz ve
        ödemeleriniz korunur; sorun yaşarsanız bize ulaşın.
      </p>

      <h2>7. Değişiklikler</h2>
      <p>Bu koşullar güncellenebilir; güncel metin bu sayfadadır. Verilmiş siparişlere sipariş anındaki koşullar uygulanır.</p>

      <h2>8. Uygulanacak hukuk</h2>
      <p>
        Bu koşullar Türkiye Cumhuriyeti hukukuna tabidir. Tüketici işlemlerinde 6502 sayılı Tüketicinin Korunması Hakkında
        Kanun&apos;daki başvuru ve yetki kuralları (Tüketici Hakem Heyeti, Tüketici Mahkemesi) saklıdır.
      </p>

      <h2>9. İletişim</h2>
      <SellerContact business={business} />
    </LegalPage>
  );
}
