/**
 * Sepet eşitleme: tarayıcıda saklanan sepet, sunucudaki güncel ürün bilgisiyle karşılaştırılır.
 * Bulunamayan ya da satıştan kalkan ürün çıkarılır, ad/fiyat/görsel güncellenir, adet stoğa indirilir;
 * her değişiklik müşteriye bir cümleyle söylenir (indirim başladı / bitti dahil). Sipariş tutarı ve stok yine
 * /api/checkout'ta doğrulanır.
 */

import { formatPrice, type CartItem } from "@/types";

export const CART_SYNC_MAX_ITEMS = 50;
const MAX_QUANTITY = 99;

/** Sunucunun bir varyant için okuduğu güncel bilgi */
export interface CartVariantSnapshot {
  productSlug: string;
  productName: string;
  variantName: string;
  /** Satış fiyatı (indirim sürüyorsa indirimli) */
  priceKurus: number;
  /** İndirim sürüyorsa indirimden önceki fiyat */
  compareAtPriceKurus: number | null;
  stockQuantity: number;
  isAvailable: boolean;
  productPublished: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
}

export type CartLine =
  | {
      variantId: string;
      status: "ok";
      productSlug: string;
      productName: string;
      variantName: string;
      priceKurus: number;
      compareAtPriceKurus?: number | null;
      maxQuantity: number;
      imageUrl: string | null;
      imageAlt: string | null;
    }
  | { variantId: string; status: "gone" | "unavailable" | "out_of_stock" };

/** Checkout'un kurallarıyla aynı: yayında değil / varyant kapalı / fiyat yok = satışta değil */
export function cartLineFor(variantId: string, v: CartVariantSnapshot | undefined): CartLine {
  if (!v) return { variantId, status: "gone" };
  if (!v.productPublished || !v.isAvailable || v.priceKurus <= 0) return { variantId, status: "unavailable" };
  if (v.stockQuantity <= 0) return { variantId, status: "out_of_stock" };
  return {
    variantId,
    status: "ok",
    productSlug: v.productSlug,
    productName: v.productName,
    variantName: v.variantName,
    priceKurus: v.priceKurus,
    compareAtPriceKurus: v.compareAtPriceKurus,
    maxQuantity: Math.min(v.stockQuantity, MAX_QUANTITY),
    imageUrl: v.imageUrl,
    imageAlt: v.imageAlt,
  };
}

const REMOVED_REASON: Record<Exclude<CartLine["status"], "ok">, string> = {
  gone: "artık bulunamadığı için sepetinizden çıkarıldı",
  unavailable: "şu anda satışta olmadığı için sepetinizden çıkarıldı",
  out_of_stock: "stokta kalmadığı için sepetinizden çıkarıldı",
};

const itemLabel = (product: string, variant: string) => (variant ? `${product} (${variant})` : product);

/**
 * Sunucu yanıtını sepete uygular. Yanıtta olmayan kalem (istek sürerken eklenmiş) olduğu gibi kalır.
 * `changes`: müşteriye gösterilecek cümleler.
 */
export function applyCartSync(items: CartItem[], lines: CartLine[]): { items: CartItem[]; changes: string[] } {
  const byId = new Map(lines.map((l) => [l.variantId, l]));
  const next: CartItem[] = [];
  const changes: string[] = [];

  for (const item of items) {
    const line = byId.get(item.variantId);
    if (!line) {
      next.push(item);
      continue;
    }
    if (line.status !== "ok") {
      changes.push(`“${itemLabel(item.productName, item.variantName)}” ${REMOVED_REASON[line.status]}.`);
      continue;
    }

    const name = itemLabel(line.productName, line.variantName);
    const quantity = Math.min(item.quantity, line.maxQuantity);
    if (line.priceKurus !== item.priceKurus) {
      const sale = line.compareAtPriceKurus ?? null;
      changes.push(
        sale !== null && line.priceKurus < item.priceKurus
          ? `“${name}” indirime girdi: ${formatPrice(line.priceKurus)} (önceden ${formatPrice(item.priceKurus)}).`
          : item.compareAtPriceKurus && sale === null
            ? `“${name}” indiriminin süresi doldu: fiyatı ${formatPrice(line.priceKurus)} (sepette ${formatPrice(item.priceKurus)} görünüyordu).`
            : `“${name}” fiyatı güncellendi: ${formatPrice(line.priceKurus)} (önceden ${formatPrice(item.priceKurus)}).`
      );
    }
    if (quantity < item.quantity) {
      changes.push(`“${name}” için stokta ${quantity} adet var; sepetteki adet ${quantity} yapıldı.`);
    }
    next.push({
      ...item,
      productSlug: line.productSlug,
      productName: line.productName,
      variantName: line.variantName,
      priceKurus: line.priceKurus,
      compareAtPriceKurus: line.compareAtPriceKurus ?? null,
      imageUrl: line.imageUrl ?? item.imageUrl,
      imageAlt: line.imageAlt ?? item.imageAlt,
      isAvailable: true,
      maxQuantity: line.maxQuantity,
      quantity,
    });
  }

  return { items: next, changes };
}
