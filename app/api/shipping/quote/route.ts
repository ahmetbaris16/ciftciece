/**
 * POST /api/shipping/quote — sepet için kargo ücreti (sepet ve ödeme ekranı gösterimi).
 * Girdi: { items: [{ variantId, quantity }] }. Fiyatlar sunucudan okunur; istemci fiyatına güvenilmez.
 * Sipariş anında tutar /api/checkout'ta aynı fonksiyonla (quoteShipping) yeniden hesaplanır.
 *
 * Yanıt: { quote: { status: "free" | "priced" | "recipient", carrierName, feeKurus } }
 * "recipient" = kargo ücreti henüz girilmemiş, gönderi alıcı ödemeli (kargo teslimatta ödenir).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getVariantById } from "@/lib/repositories";
import { getShippingSettings } from "@/lib/shipping/shipping.repository";
import { quoteShipping } from "@/lib/shipping/quote";
import { CheckoutItemSchema } from "@/lib/validation/checkout";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ items: z.array(CheckoutItemSchema).max(50) });

export async function POST(request: NextRequest) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });

  try {
    let subtotalKurus = 0;
    for (const item of parsed.data.items) {
      const found = await getVariantById(item.variantId);
      // Satışta olmayan ürün siparişe giremez; ücretsiz kargo sınırına da sayılmaz (ödeme adımı ayrıca uyarır)
      if (!found || !found.product.isPublished || !found.variant.isAvailable) continue;
      subtotalKurus += found.variant.priceKurus * item.quantity;
    }

    const quote = quoteShipping({ subtotalKurus }, await getShippingSettings());
    return NextResponse.json({
      quote: { status: quote.status, carrierName: quote.carrier.name, feeKurus: quote.feeKurus },
    });
  } catch (err) {
    console.error("[/api/shipping/quote]", err);
    return NextResponse.json({ error: "Kargo ücreti şu anda hesaplanamıyor." }, { status: 503 });
  }
}
