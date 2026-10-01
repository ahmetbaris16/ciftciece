// Metin lib/legal/content.ts'te (ödeme adımı ve sipariş e-postasıyla aynı kaynak). Metin değişirse
// lib/legal/documents.ts'teki sürümü güncelleyin: siparişte onaylanan sürüm order_consents'e oradan yazılır.
import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import LegalSections from "@/components/legal/LegalSections";
import { getBusinessInfo } from "@/lib/business/business.repository";
import { preInformationSections } from "@/lib/legal/content";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

export const metadata: Metadata = {
  title: "Ön Bilgilendirme Formu",
  description: "Mesafeli Sözleşmeler Yönetmeliği uyarınca sipariş öncesi bilgilendirme: satıcı, ürün, fiyat, ödeme, teslimat, cayma hakkı.",
  robots: { index: true, follow: true },
};

export const revalidate = 300;

export default async function OnBilgilendirmePage() {
  const business = await getBusinessInfo();
  return (
    <LegalPage
      title="Ön Bilgilendirme Formu"
      meta="6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca"
      updated={LEGAL_DOCUMENTS.PRE_INFORMATION_FORM.version}
    >
      <p>
        Bu form, siparişinizi onaylamadan önce bilmeniz gerekenleri içerir. Ödeme adımında sepetinize özel hâli
        gösterilir ve siparişinizle birlikte e-postanıza gönderilir.
      </p>
      <LegalSections sections={preInformationSections(business)} />
    </LegalPage>
  );
}
