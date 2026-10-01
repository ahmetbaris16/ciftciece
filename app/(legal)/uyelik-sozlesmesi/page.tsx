// Üye olurken onaylanan metin (lib/legal/documents.ts MEMBERSHIP_AGREEMENT sürümü).
import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/legal/LegalPage";
import SellerContact from "@/components/legal/SellerContact";
import { getBusinessInfo } from "@/lib/business/business.repository";
import { sellerDisplayName } from "@/lib/business/info";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

export const metadata: Metadata = {
  title: "Üyelik Sözleşmesi",
  description: "Site üyeliğinin koşulları.",
  robots: { index: true, follow: true },
};

export const revalidate = 300;

export default async function UyelikSozlesmesiPage() {
  const business = await getBusinessInfo();
  const seller = sellerDisplayName(business);
  return (
    <LegalPage title="Üyelik Sözleşmesi" updated={LEGAL_DOCUMENTS.MEMBERSHIP_AGREEMENT.version}>
      <h2>1. Taraflar</h2>
      <p>
        Bu sözleşme, <strong>{seller}</strong> (“Satıcı”) ile sitede üye olan kişi (“Üye”) arasında, üyelik formunun
        onaylanmasıyla kurulur.
      </p>

      <h2>2. Konu</h2>
      <p>
        Üyelik; siparişlerinizi tek yerden takip etmenizi, bilgilerinizin sonraki siparişlerde hazır gelmesini ve satın
        aldığınız ürünleri değerlendirmenizi sağlar. Üye olmadan da sipariş verilebilir. Üyelik ücretsizdir.
      </p>

      <h2>3. Üyenin yükümlülükleri</h2>
      <ul>
        <li>Üyelik bilgilerini doğru ve güncel tutmak</li>
        <li>Şifresini gizli tutmak; hesabında yetkisiz kullanım fark ederse bize bildirmek</li>
        <li>
          Ürün değerlendirmelerinde gerçeğe aykırı, hakaret içeren, başkalarının haklarını ihlal eden ya da reklam amaçlı
          içerik paylaşmamak
        </li>
      </ul>

      <h2>4. Satıcının hakları ve yükümlülükleri</h2>
      <ul>
        <li>Üye bilgilerini <Link href="/kvkk">KVKK Aydınlatma Metni</Link> ve <Link href="/gizlilik">Gizlilik Politikası</Link>&apos;na göre işlemek ve korumak</li>
        <li>Ürün değerlendirmelerini yayımlamadan önce incelemek; bu sözleşmeye aykırı olanları yayımlamamak</li>
        <li>Sözleşmeye aykırı kullanımda üyeliği askıya almak ya da sonlandırmak (verilmiş siparişler etkilenmez)</li>
      </ul>

      <h2>5. Siparişler</h2>
      <p>
        Üye olarak verilen her sipariş ayrıca <Link href="/on-bilgilendirme">Ön Bilgilendirme Formu</Link> ve{" "}
        <Link href="/mesafeli-satis-sozlesmesi">Mesafeli Satış Sözleşmesi</Link>&apos;ne tabidir; cayma ve iade
        haklarınız üyelikten bağımsızdır.
      </p>

      <h2>6. Sözleşmenin sona ermesi</h2>
      <p>
        Üye istediği zaman üyeliğini sonlandırabilir: bize e-postayla ya da aşağıdaki iletişim bilgilerinden bildirmesi
        yeterlidir. Yasal saklama yükümlülüğü olan sipariş kayıtları dışındaki üyelik bilgileri silinir.
      </p>

      <h2>7. Değişiklikler ve uyuşmazlık</h2>
      <p>
        Sözleşme güncellenebilir; güncel metin bu sayfadadır ve önemli değişiklikler üyelere bildirilir. Uyuşmazlıklarda
        6502 sayılı Kanun&apos;daki başvuru yolları (Tüketici Hakem Heyeti, Tüketici Mahkemesi) saklıdır.
      </p>

      <h2>8. İletişim</h2>
      <SellerContact business={business} />
    </LegalPage>
  );
}
