import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hesabım",
  description: "Siparişleriniz, ürün değerlendirmeleriniz ve hesap bilgileriniz.",
  robots: { index: false, follow: false },
};

export default function HesabimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
