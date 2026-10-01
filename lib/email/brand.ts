/**
 * E-postaların ortak parçaları: site adresi ve satıcı bilgili altbilgi.
 */

import { formatPhoneTr, sellerDisplayName, type BusinessInfo } from "@/lib/business/info";
import type { EmailFooter } from "./layout";

/** E-postalardaki bağlantıların kökü (canlıda NEXT_PUBLIC_APP_URL; Host başlığına güvenilmez) */
export function siteUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return (url || "http://localhost:3000").replace(/\/+$/, "");
}

export function emailFooter(business: BusinessInfo, reason: string): EmailFooter {
  return {
    sellerName: sellerDisplayName(business),
    lines: [
      business.address,
      business.phone ? formatPhoneTr(business.phone) : "",
      business.email,
    ],
    reason,
    siteUrl: siteUrl(),
  };
}

/** Müşteri e-postalarında "yanıtla" adresi: işletmenin e-postası */
export function replyToFor(business: BusinessInfo): string | null {
  return business.email || null;
}
