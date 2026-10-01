/**
 * Cart API
 *
 * POST /api/cart/validate
 * Client'tan gelen sepet içeriğini server'da doğrular.
 * Frontend fiyatlarına GÜVENME — fiyat burada hesaplanır.
 *
 * Input: { items: Array<{ variantId: string; quantity: number }> }
 * Output: { validatedItems, subtotalKurus, errors }
 */

import { NextRequest, NextResponse } from "next/server";
import { getVariantById } from "@/lib/repositories";
import { z } from "zod";

const CartItemSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
});

const CartValidateSchema = z.object({
  items: z.array(CartItemSchema).min(1).max(50),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CartValidateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { items } = parsed.data;
  const validatedItems = [];
  const errors: string[] = [];
  let subtotalKurus = 0;

  for (const item of items) {
    const found = await getVariantById(item.variantId);

    if (!found) {
      errors.push(`Ürün bulunamadı: ${item.variantId}`);
      continue;
    }

    const { product, variant } = found;

    if (!variant.isAvailable) {
      errors.push(`${product.name} (${variant.name}) stokta yok`);
      continue;
    }

    if (variant.priceKurus <= 0) {
      errors.push(`${product.name} (${variant.name}) fiyatı henüz belirlenmemiş`);
      continue;
    }

    // Stok kontrolü (mock: stockQuantity)
    const maxQty = variant.stockQuantity ?? 99;
    const quantity = Math.min(item.quantity, maxQty);

    const lineTotal = variant.priceKurus * quantity;
    subtotalKurus += lineTotal;

    validatedItems.push({
      variantId: variant.id,
      productName: product.name,
      variantName: variant.name,
      priceKurus: variant.priceKurus, // SERVER'DAN gelen fiyat
      quantity,
      lineTotalKurus: lineTotal,
      imageUrl: product.images[0]?.url ?? null,
    });
  }

  return NextResponse.json({
    validatedItems,
    subtotalKurus,
    itemCount: validatedItems.reduce((s, i) => s + i.quantity, 0),
    errors,
    isValid: errors.length === 0 && validatedItems.length > 0,
  });
}
