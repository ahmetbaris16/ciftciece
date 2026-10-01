/**
 * tx1 (sipariş + stok rezervasyonu) bölünmez olmalı: ortasında hata olursa yarım sipariş ya da
 * düşmüş stok kalmaz.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { createOrder, OutOfStockError } from "@/lib/repositories/order.repository";
import { createProduct, stockOf, setupTestDb, withFailingInserts } from "./helpers/db";

setupTestDb();

function orderInput(items: Array<{ variantId: string; priceKurus: number; quantity: number }>) {
  const subtotalKurus = items.reduce((s, i) => s + i.priceKurus * i.quantity, 0);
  return {
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
    items: items.map((i) => ({
      variantId: i.variantId,
      snapshotName: "Ürün",
      snapshotVariant: "1 kg",
      snapshotPrice: i.priceKurus,
      quantity: i.quantity,
    })),
    subtotalKurus,
    shippingKurus: 0,
    paymentMethod: "CARD" as const,
    paymentDueAt: new Date(Date.now() + 30 * 60_000),
    initialStatus: "PENDING" as const,
  };
}

test("ikinci kalemde stok yetmezse ilk kalemin düşen stoğu geri alınır, sipariş açılmaz", async () => {
  const a = await createProduct({ priceKurus: 10_000, stock: 5 });
  const b = await createProduct({ priceKurus: 20_000, stock: 1 });

  await assert.rejects(
    createOrder(
      orderInput([
        { variantId: a.variant.id, priceKurus: 10_000, quantity: 2 },
        { variantId: b.variant.id, priceKurus: 20_000, quantity: 3 },
      ])
    ),
    OutOfStockError
  );

  assert.equal(await stockOf(a.variant.id), 5);
  assert.equal(await stockOf(b.variant.id), 1);
  assert.equal(await prisma.order.count(), 0);
  assert.equal(await prisma.orderItem.count(), 0);
});

test("kalemleri ters sırada gelen eşzamanlı siparişler kilitlenmeden (deadlock) tamamlanır", async () => {
  const a = await createProduct({ priceKurus: 10_000, stock: 100 });
  const b = await createProduct({ priceKurus: 20_000, stock: 100 });
  const ab = [
    { variantId: a.variant.id, priceKurus: 10_000, quantity: 1 },
    { variantId: b.variant.id, priceKurus: 20_000, quantity: 1 },
  ];
  const ba = [...ab].reverse();
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) => createOrder(orderInput(i % 2 === 0 ? ab : ba)))
  );
  const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  assert.equal(failed.length, 0, failed.map((f) => String(f.reason)).join("\n"));
  assert.equal(await stockOf(a.variant.id), 90);
  assert.equal(await stockOf(b.variant.id), 90);
});

test("sipariş kalemi yazılırken DB hatası olursa yarım sipariş kalmaz, stok geri döner", async () => {
  const a = await createProduct({ priceKurus: 10_000, stock: 5 });

  await withFailingInserts("order_items", () =>
    assert.rejects(createOrder(orderInput([{ variantId: a.variant.id, priceKurus: 10_000, quantity: 2 }])), /yapay DB hatasi/)
  );

  assert.equal(await stockOf(a.variant.id), 5, "stok düşümü geri alınmalı");
  assert.equal(await prisma.order.count(), 0, "sipariş satırı kalmamalı");
  assert.equal(await prisma.orderItem.count(), 0);

  // Hata geçince aynı sipariş normal açılır
  const order = await createOrder(orderInput([{ variantId: a.variant.id, priceKurus: 10_000, quantity: 2 }]));
  assert.equal(order.status, "PENDING");
  assert.equal(await stockOf(a.variant.id), 3);
});
