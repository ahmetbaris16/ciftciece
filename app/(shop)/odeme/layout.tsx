import type { Metadata } from "next";

// Ödeme sayfası istemci bileşeni: başlık ve robots kuralı bu layout'tan gelir
export const metadata: Metadata = {
  title: "Ödeme",
  robots: { index: false, follow: false },
};

export default function OdemeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
