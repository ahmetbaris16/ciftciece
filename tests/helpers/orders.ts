/**
 * Test siparişleri: gerçek createOrder ile (tx1: stok rezervasyonu dahil) açılır.
 */

import { prisma } from "@/lib/db/prisma";
import { createOrder } from "@/lib/repositories/order.repository";
import type { PaymentMethod } from "@/types";
import { createProduct } from "./db";

export async function createTestOrder(
  opts: {
    method?: PaymentMethod;
    priceKurus?: number;
    quantity?: number;
    stock?: number;
    dueInMinutes?: number | null;
  } = {}
) {
  const method = opts.method ?? "CARD";
  const priceKurus = opts.priceKurus ?? 23_900;
  const quantity = opts.quantity ?? 1;
  const { variant } = await createProduct({ priceKurus, stock: opts.stock ?? 10 });
  const dueInMinutes = opts.dueInMinutes === undefined ? 30 : opts.dueInMinutes;
  const order = await createOrder({
    guestEmail: "musteri@example.com",
    guestName: "Test Müşteri",
    guestPhone: "+905320000000",
    shippingAddress: {
      firstName: "Test",
      lastName: "Müşteri",
      phone: "+905320000000",
      city: "Bursa",
      district: "Orhangazi",
      address: "Test Mahallesi Deneme Sokak No 1",
    },
    items: [{ variantId: variant.id, snapshotName: "Zeytin", snapshotVariant: "1 kg", snapshotPrice: priceKurus, quantity }],
    subtotalKurus: priceKurus * quantity,
    shippingKurus: 0,
    paymentMethod: method,
    paymentDueAt: dueInMinutes === null ? null : new Date(Date.now() + dueInMinutes * 60_000),
    initialStatus: method === "CASH_ON_DELIVERY" ? "PROCESSING" : "PENDING",
    offlinePaymentProvider: method === "BANK_TRANSFER" ? "havale" : method === "CASH_ON_DELIVERY" ? "kapida" : undefined,
  });
  return { order, variant };
}

/** Siparişin son ödeme zamanını geçmişe çeker (süre doldu taklidi) */
export async function makeOverdue(orderId: string) {
  await prisma.order.update({ where: { id: orderId }, data: { paymentDueAt: new Date(Date.now() - 60_000) } });
}

export async function orderState(orderId: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, needsAttention: true, notes: true },
  });
}
