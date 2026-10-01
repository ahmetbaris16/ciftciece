/**
 * GET /api/products
 * Ürün listesi — query params: category, featured, limit
 *
 * Repository pattern — DB varsa Prisma, yoksa mock fallback.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAllProducts, getFeaturedProducts } from "@/lib/repositories";

export const revalidate = 60; // 60 sn cache

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") ?? undefined;
  const featured = searchParams.get("featured") === "true";
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  try {
    if (featured) {
      const products = await getFeaturedProducts(limit ?? 4);
      return NextResponse.json({ products, total: products.length });
    }

    const products = await getAllProducts(category);
    const paginated = limit ? products.slice(0, limit) : products;

    return NextResponse.json({
      products: paginated,
      total: products.length,
    });
  } catch (err) {
    console.error("[/api/products] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
