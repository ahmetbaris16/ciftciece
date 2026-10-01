import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ShopClientWrapper from "@/components/layout/ShopClientWrapper";

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
    </ShopClientWrapper>
  );
}
