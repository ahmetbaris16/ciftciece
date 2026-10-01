// Metin lib/legal/content.ts'te (ödeme adımı ve sipariş e-postasıyla aynı kaynak). Metin değişirse
// lib/legal/documents.ts'teki sürümü güncelleyin: siparişte onaylanan sürüm order_consents'e oradan yazılır.
import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import LegalSections from "@/components/legal/LegalSections";
import { getBusinessInfo } from "@/lib/business/business.repository";
import { distanceSalesSections } from "@/lib/legal/content";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

export const metadata: Metadata = {
  title: "Mesafeli Satış Sözleşmesi",
  description: "Mesafeli satış sözleşmesi — 6502 sayılı Tüketicinin Korunması Hakkında Kanun uyarınca.",
  robots: { index: true, follow: true },
};

export const revalidate = 300;

export default async function MesafeliSatisSozlesmesiPage() {
  const business = await getBusinessInfo();
  return (
    <LegalPage
      title="Mesafeli Satış Sözleşmesi"
      meta="6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca"
      updated={LEGAL_DOCUMENTS.DISTANCE_SALES_CONTRACT.version}
    >
      <p>
        Sözleşmenin siparişinize özel hâli (ürünler, fiyat, teslimat adresi, ödeme yöntemi) ödeme adımında gösterilir;
        siparişi onayladığınızda bir kopyası e-postanıza gönderilir ve sipariş sayfanızdan erişilebilir.
      </p>
      <LegalSections sections={distanceSalesSections(business)} />
    </LegalPage>
  );
}
