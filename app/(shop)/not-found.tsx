import type { Metadata } from "next";
import NotFoundContent from "@/components/layout/NotFoundContent";

export const metadata: Metadata = {
  title: "Sayfa Bulunamadı",
};

// Ürün/kategori bulunamadığında (notFound()) mağaza başlığı ve altbilgisiyle birlikte gösterilir
export default function ShopNotFound() {
  return <NotFoundContent />;
}
