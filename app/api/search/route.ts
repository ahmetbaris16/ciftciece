/**
 * GET /api/search?q=...
 * Ürün arama API
 *
 * Full-text search mock. DB gelince Prisma full-text veya vector search.
 */

import { NextRequest, NextResponse } from "next/server";
import { searchProducts } from "@/lib/repositories";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [], total: 0, query });
  }

  if (query.length > 100) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 });
  }

  try {
    const results = await searchProducts(query);
    return NextResponse.json({
      results,
      total: results.length,
      query,
    });
  } catch (err) {
    console.error("[/api/search] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
