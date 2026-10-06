/**
 * Stok — admin'in elle yazdığı değerler (R-06).
 *
 * Admin stoğu mutlak değerle yazar ("rafta 20 tane var"). Düzenleme sayfası açıldıktan sonra satış ya da
 * iptal olduysa sayfadaki eski değeri yazmak satılan ürünü stoğa geri ekler ve olmayan ürün satılır.
 * Bu yüzden yazım koşulludur: veritabanındaki değer, admin'in sayfada gördüğü değerle (expected) hâlâ
 * aynıysa yeni değer yazılır; değilse StockChangedError (hiçbir şey yazılmaz, çağıranın işlemi geri alınır).
 * Admin'in değiştirmediği stoğa dokunulmaz.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { recordPriceChange } from "./discount.repository";

export interface StockWrite {
  variantId: string;
  /** Admin'in sayfada gördüğü (formun açıldığı andaki) stok */
  expected: number;
  /** Admin'in yazdığı yeni stok */
  quantity: number;
}

export interface StockConflict {
  variantId: string;
  expected: number;
  /** Veritabanındaki güncel değer (stok satırı yoksa null) */
  current: number | null;
}

export class StockChangedError extends Error {
  constructor(readonly conflicts: StockConflict[]) {
    super("Stok bu arada değişti");
    this.name = "StockChangedError";
  }
}

/**
 * Transaction içinde çağrılır. Satırlar variantId sırasıyla yazılır (kilit sırası sipariş yoluyla aynı,
 * R-26). Koşul tutmayan satır varsa StockChangedError fırlatılır.
 */
export async function writeStockIfUnchanged(tx: Prisma.TransactionClient, writes: StockWrite[]): Promise<void> {
  const ordered = [...writes].sort((a, b) => (a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0));
  const conflicts: StockConflict[] = [];
  for (const w of ordered) {
    if (w.expected === w.quantity) continue;
    const { count } = await tx.inventory.updateMany({
      where: { variantId: w.variantId, quantity: w.expected },
      data: { quantity: w.quantity },
    });
    if (count === 1) continue;
    const current = await tx.inventory.findUnique({ where: { variantId: w.variantId }, select: { quantity: true } });
    if (!current && w.expected === 0) {
      // Stok satırı hiç açılmamış varyant: "0 görüyordum" doğru, satır açılır
      await tx.inventory.create({ data: { variantId: w.variantId, quantity: w.quantity } });
      continue;
    }
    conflicts.push({ variantId: w.variantId, expected: w.expected, current: current?.quantity ?? null });
  }
  if (conflicts.length > 0) throw new StockChangedError(conflicts);
}

export interface VariantUpdate {
  name?: string;
  sku?: string | null;
  priceKurus?: number;
  isAvailable?: boolean;
  sortOrder?: number;
}

/**
 * Varyant bilgisi ve (verildiyse) stok tek işlemde güncellenir: stok çakışırsa varyant değişikliği de
 * geri alınır. Fiyat değiştiyse fiyat geçmişine aynı işlemde yazılır (indirimde eski fiyat hesabı).
 * Varyant bu ürüne ait değilse null.
 */
export async function updateVariantAndStock(
  productId: string,
  variantId: string,
  data: VariantUpdate,
  stock?: { expected: number; quantity: number }
) {
  return prisma.$transaction(async (tx) => {
    const variant = await tx.productVariant.findFirst({
      where: { id: variantId, productId },
      select: { id: true, priceKurus: true, product: { select: { createdAt: true } } },
    });
    if (!variant) return null;
    await tx.productVariant.update({ where: { id: variantId }, data });
    if (data.priceKurus !== undefined) {
      await recordPriceChange(tx, {
        variantId,
        oldPriceKurus: variant.priceKurus,
        newPriceKurus: data.priceKurus,
        since: variant.product.createdAt,
      });
    }
    if (stock) await writeStockIfUnchanged(tx, [{ variantId, ...stock }]);
    return tx.productVariant.findUniqueOrThrow({ where: { id: variantId }, include: { inventory: true } });
  });
}

/** Toplu stok: hepsi ya da hiçbiri. */
export async function writeStockBulk(writes: StockWrite[]): Promise<void> {
  await prisma.$transaction((tx) => writeStockIfUnchanged(tx, writes));
}
