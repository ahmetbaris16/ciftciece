import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ShopClientWrapper from "@/components/layout/ShopClientWrapper";
import { USE_DB } from "@/lib/data/source";

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ShopClientWrapper>
      <Header />
      <main id="main-content">
        {children}
      </main>
      <Footer />
      {/* Veritabanısız deneme kipi yalnız geliştirmede açılır: "site çalışmıyor" sanılmasın diye açıkça yazılır */}
      {!USE_DB && (
        <p role="note" style={mockBanner}>
          Veritabanısız deneme kipi: ürünler örnek veriden gelir, sipariş verilemez, yönetim paneli boş görünür. Gerçek deneme
          için siteyi veritabanıyla açın (Siteyi Ac).
        </p>
      )}
    </ShopClientWrapper>
  );
}

const mockBanner: React.CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 1000,
  margin: 0,
  padding: "8px 16px",
  background: "#7a1d14",
  color: "#fff",
  fontSize: "13px",
  lineHeight: 1.4,
  textAlign: "center",
};
