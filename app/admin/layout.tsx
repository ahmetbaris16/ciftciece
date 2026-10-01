import type { Metadata } from "next";
import { SessionProvider } from "@/components/admin/SessionProvider";

export const metadata: Metadata = {
  title: {
    default: "Yönetim Paneli",
    template: "%s | Çiftçi Ece Yönetim",
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}
