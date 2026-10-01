/**
 * POST /api/shipping/quote — sepet için Yurtiçi Kargo ücreti (sepet ve ödeme ekranı gösterimi).
 * Girdi: { items: [{ variantId, quantity }] }. Fiyat ve SKU sunucudan okunur; istemci fiyatına güvenilmez.
 * Sipariş anında tutar /api/checkout'ta aynı fonksiyonla (quoteShipping) yeniden hesaplanır.
 *
 * Yanıt: { quote: { status: "free" | "priced" | "recipient" | "unknown", carrierName, feeKurus?, parcelCount? } }
 * "recipient" = ücret hesaplanamadı, gönderi alıcı ödemeli (kargo teslimatta ödenir).
 * Tarife/ölçü ayrıntısı ve eksik SKU listesi müşteriye gönderilmez (yalnız sunucu loguna).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getVariantById } from "@/lib/repositories";
import { getShippingSettings } from "@/lib/shipping/shipping.repository";
import { quoteShipping, type ShippingLine } from "@/lib/shipping/quote";
import { CheckoutItemSchema } from "@/lib/validation/checkout";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ items: z.array(CheckoutItemSchema).max(50) });

export async function POST(request: NextRequest) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });

  try {
    const lines: ShippingLine[] = [];
    let subtotalKurus = 0;
    for (const item of parsed.data.items) {
      const found = await getVariantById(item.variantId);
      // Satışta olmayan ürün siparişe giremez; kargo hesabına da katılmaz (ödeme adımı ayrıca uyarır)
      if (!found || !found.product.isPublished || !found.variant.isAvailable) continue;
      subtotalKurus += found.variant.priceKurus * item.quantity;
      lines.push({ sku: found.variant.sku, quantity: item.quantity });
    }

    const quote = await quoteShipping({ lines, subtotalKurus }, await getShippingSettings());
    if (quote.status === "unknown" || quote.status === "recipient") {
      console.info(`[/api/shipping/quote] ücret hesaplanamadı: ${quote.reason}${quote.skus ? ` (${quote.skus.join(", ")})` : ""}`);
    }

    return NextResponse.json({
      quote: {
        status: quote.status,
        carrierName: quote.carrier.name,
        ...(quote.status !== "unknown" && { feeKurus: quote.feeKurus }),
        ...(quote.status === "priced" && { parcelCount: quote.parcels.length }),
      },
    });
  } catch (err) {
    console.error("[/api/shipping/quote]", err);
    return NextResponse.json({ error: "Kargo ücreti şu anda hesaplanamıyor." }, { status: 503 });
  }
}
