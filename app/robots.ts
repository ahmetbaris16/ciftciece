import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// Arama motorları vitrin sayfalarını dolaşsın; yönetim, API, sepet/ödeme/hesap ve arama sonuçları dışarıda kalsın.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/sepet", "/odeme", "/hesabim", "/siparis/", "/arama"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
