import type { MetadataRoute } from "next";
import { getAllCategories, getAllProducts } from "@/lib/repositories";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// Ürünler/kategoriler DB'den geldiği için her istekte üretilir (build sırasında DB olmayabilir).
export const dynamic = "force-dynamic";

const STATIC_PAGES: Array<{ path: string; priority: number }> = [
  { path: "/", priority: 1 },
  { path: "/urunler", priority: 0.9 },
  { path: "/magaza", priority: 0.6 },
  { path: "/teslimat", priority: 0.3 },
  { path: "/iade-ve-iptal", priority: 0.3 },
  { path: "/gizlilik", priority: 0.2 },
  { path: "/kvkk", priority: 0.2 },
  { path: "/cerez-politikasi", priority: 0.2 },
  { path: "/mesafeli-satis-sozlesmesi", priority: 0.2 },
  { path: "/on-bilgilendirme", priority: 0.2 },
  { path: "/kullanim-kosullari", priority: 0.2 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = STATIC_PAGES.map(({ path, priority }) => ({
    url: `${BASE_URL}${path === "/" ? "" : path}`,
    lastModified: now,
    priority,
  }));

  try {
    const [categories, products] = await Promise.all([getAllCategories(), getAllProducts()]);
    for (const c of categories) {
      entries.push({ url: `${BASE_URL}/kategori/${c.slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.8 });
    }
    for (const p of products) {
      entries.push({ url: `${BASE_URL}/urun/${p.slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.7 });
    }
  } catch (err) {
    // DB'ye ulaşılamazsa sitemap yine de sabit sayfalarla döner
    console.error("[sitemap] Ürünler/kategoriler yüklenemedi:", err);
  }

  return entries;
}
