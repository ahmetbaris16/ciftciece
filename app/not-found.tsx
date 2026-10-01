import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ShopClientWrapper from "@/components/layout/ShopClientWrapper";
import NotFoundContent from "@/components/layout/NotFoundContent";

export const metadata: Metadata = {
  title: "Sayfa Bulunamadı",
};

// Hiçbir sayfayla eşleşmeyen adresler: kök layout'ta başlık/altbilgi olmadığı için burada eklenir
export default function NotFound() {
  return (
    <ShopClientWrapper>
      <Header />
      <main id="main-content">
        <NotFoundContent />
      </main>
      <Footer />
    </ShopClientWrapper>
  );
}
