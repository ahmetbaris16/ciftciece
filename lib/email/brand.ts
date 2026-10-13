/**
 * E-postaların ortak parçaları: site adresi ve satıcı bilgili altbilgi.
 */

import { formatPhoneTr, storeDisplayName, type BusinessInfo } from "@/lib/business/info";
import type { EmailFooter } from "./layout";

/** E-postalardaki bağlantıların kökü (canlıda NEXT_PUBLIC_APP_URL; Host başlığına güvenilmez) */
export function siteUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return (url || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * E-postadaki ürün görseli: sitenin görsel küçültücüsünden (/_next/image, 128 px) gelir; e-posta programı görseli
 * siteden indirir. Site internetten erişilemiyorsa (yerel adres, https değil) görsel konmaz — kırık görsel yerine
 * görselsiz liste. Dış adresli görseller konmaz (küçültücü yalnız site içi görselleri işler).
 */
export function emailImageUrl(src: string | null | undefined): string | null {
  const base = siteUrl();
  if (!src || !src.startsWith("/") || src.startsWith("//")) return null;
  if (!base.startsWith("https://") || /^https:\/\/(localhost|127\.|\[::1\])/i.test(base)) return null;
  return `${base}/_next/image?url=${encodeURIComponent(src)}&w=128&q=75`;
}

export function emailFooter(business: BusinessInfo, reason: string): EmailFooter {
  return {
    sellerName: storeDisplayName(business),
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
