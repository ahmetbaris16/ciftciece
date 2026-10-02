/**
 * POST /api/cart — sepet eşitleme.
 * Girdi: { variantIds: string[] } (tarayıcıda saklanan sepetin kalemleri).
 * Yanıt: { lines } — her kalem için güncel ad/fiyat/stok ya da neden satılamadığı
 * ("gone" bulunamadı, "unavailable" satışta değil, "out_of_stock" stok yok).
 * Yalnız gösterim içindir: sipariş tutarı ve stok /api/checkout'ta yeniden doğrulanır.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCartVariants } from "@/lib/repositories";
import { CART_SYNC_MAX_ITEMS, cartLineFor } from "@/lib/cart/sync";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  variantIds: z.array(z.string().min(1).max(191)).min(1).max(CART_SYNC_MAX_ITEMS),
});

export async function POST(request: NextRequest) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });

  const ids = [...new Set(parsed.data.variantIds)];
  try {
    const found = await getCartVariants(ids);
    return NextResponse.json(
      { lines: ids.map((id) => cartLineFor(id, found.get(id))) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[/api/cart]", err);
    return NextResponse.json({ error: "Sepet şu anda doğrulanamıyor." }, { status: 503 });
  }
}
