/**
 * GET /api/products/lite — öneri kartları için hafif ürün listesi
 * (sepet paneli ve sepet sayfasındaki "kargo bedava olsun" önerileri).
 * Fiyat/stok gösterim içindir; sipariş tutarı her zaman sunucuda yeniden hesaplanır.
 *
 * İstek anında çalışır (derlemede önceden üretilmez: DB kapalıyken hata yanıtı önbelleğe
 * alınmasın); tarayıcı/CDN 60 sn önbellekler.
 */

import { NextResponse } from "next/server";
import { getAllProducts } from "@/lib/repositories";
import { toLiteProduct } from "@/lib/catalog/recommendations";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = (await getAllProducts()).map(toLiteProduct);
    return NextResponse.json(
      { products },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
    );
  } catch (err) {
    console.error("[/api/products/lite]", err);
    return NextResponse.json({ error: "Ürünler yüklenemedi." }, { status: 503 });
  }
}
