import type { Metadata } from "next";

// Sepet sayfası istemci bileşeni: başlık ve robots kuralı bu layout'tan gelir
export const metadata: Metadata = {
  title: "Sepetim",
  robots: { index: false, follow: false },
};

export default function SepetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
