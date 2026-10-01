/**
 * Para bütünlüğü: kuruş dönüşümleri tam sayıyla yapılır; sipariş kalemi snapshot'ı (ad, birim fiyat,
 * KDV oranı, adet, indirim) sipariş anında DB'den yazılır, istemcinin fiyatı yok sayılır.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { decimalToKurus, kurusToDecimalString } from "@/lib/payment/money";
import { createOrder } from "@/lib/repositories/order.repository";
import { POST as checkout } from "@/app/api/checkout/route";
import { createProduct, setupTestDb } from "./helpers/db";
import { checkoutBody, jsonRequest } from "./helpers/http";

setupTestDb();

test("kuruş → ondalık metin: tam sayı aritmetiği", () => {
  assert.equal(kurusToDecimalString(0), "0.00");
  assert.equal(kurusToDecimalString(5), "0.05");
  assert.equal(kurusToDecimalString(1999), "19.99");
  assert.equal(kurusToDecimalString(23_900), "239.00");
  assert.equal(kurusToDecimalString(900_719_925_474_099), "9007199254740.99");
  assert.throws(() => kurusToDecimalString(-1));
  assert.throws(() => kurusToDecimalString(10.5));
});

test("sağlayıcı tutarı → kuruş: kuruştan küçük kesir ve float artığı reddedilir", () => {
  assert.equal(decimalToKurus("239"), 23_900);
  assert.equal(decimalToKurus("239.9"), 23_990);
  assert.equal(decimalToKurus("239.90"), 23_990);
  assert.equal(decimalToKurus("239.900"), 23_990);
  assert.equal(decimalToKurus(239.9), 23_990);
  assert.equal(decimalToKurus(1), 100);
  assert.equal(decimalToKurus("19.99"), 1999);
  assert.equal(decimalToKurus("239.901"), null);
  assert.equal(decimalToKurus(0.1 + 0.2), null);
  assert.equal(decimalToKurus("-1"), null);
  assert.equal(decimalToKurus("1e3"), null);
  assert.equal(decimalToKurus(""), null);
  assert.equal(decimalToKurus(undefined), null);
});

test("snapshot: ad, birim fiyat, adet DB'den; KDV oranı üründen (yoksa boş); indirim 0", async () => {
  const withVat = await createProduct({ name: "Sızma Zeytinyağı", variantName: "1 L", priceKurus: 45_000, stock: 10 });
  await prisma.product.update({ where: { id: withVat.product.id }, data: { vatRateBps: 100 } });
  const noVat = await createProduct({ name: "Siyah Zeytin", variantName: "1 kg", priceKurus: 23_900, stock: 10 });

  const res = await checkout(
    jsonRequest(
      "http://localhost:3000/api/checkout",
      checkoutBody(
        [
          { variantId: withVat.variant.id, quantity: 2 },
          { variantId: noVat.variant.id, quantity: 1 },
        ],
        // İstemcinin gönderdiği fiyat/toplam alanları yok sayılır
        { totalKurus: 1, subtotalKurus: 1, priceKurus: 1 }
      )
    )
  );
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));

  const order = await prisma.order.findUniqueOrThrow({ where: { id: body.orderId }, include: { items: true } });
  assert.equal(order.subtotalKurus, 2 * 45_000 + 23_900);
  assert.equal(order.totalKurus, order.subtotalKurus + order.shippingKurus + order.paymentFeeKurus);
  const oil = order.items.find((i) => i.variantId === withVat.variant.id);
  const olive = order.items.find((i) => i.variantId === noVat.variant.id);
  assert.deepEqual(
    { name: oil?.snapshotName, variant: oil?.snapshotVariant, price: oil?.snapshotPrice, qty: oil?.quantity, vat: oil?.vatRateBps, discount: oil?.discountKurus },
    { name: "Sızma Zeytinyağı", variant: "1 L", price: 45_000, qty: 2, vat: 100, discount: 0 }
  );
  assert.equal(olive?.vatRateBps, null, "KDV oranı bilinmiyorsa uydurulmaz");

  // Ürün sonradan değişse de sipariş kalemi değişmez
  await prisma.productVariant.update({ where: { id: withVat.variant.id }, data: { priceKurus: 99_900 } });
  await prisma.product.update({ where: { id: withVat.product.id }, data: { name: "Yeni Ad", vatRateBps: 2000 } });
  const again = await prisma.orderItem.findUniqueOrThrow({ where: { id: oil!.id } });
  assert.equal(again.snapshotPrice, 45_000);
  assert.equal(again.snapshotName, "Sızma Zeytinyağı");
  assert.equal(again.vatRateBps, 100);
});

test("ara toplam kalemlerle uyuşmuyorsa sipariş açılmaz (tutar sunucuda yeniden hesaplanır)", async () => {
  const { variant } = await createProduct({ priceKurus: 10_000, stock: 5 });
  await assert.rejects(
    createOrder({
      guestEmail: "a@example.com",
      guestName: "A B",
      guestPhone: "+905320000000",
      shippingAddress: { firstName: "A", lastName: "B", phone: "+905320000000", city: "Bursa", district: "Orhangazi", address: "Adres satırı 12345" },
      items: [{ variantId: variant.id, snapshotName: "X", snapshotVariant: "1", snapshotPrice: 10_000, quantity: 2 }],
      subtotalKurus: 10_000,
      shippingKurus: 0,
      paymentMethod: "CARD",
      paymentDueAt: new Date(Date.now() + 60_000),
      initialStatus: "PENDING",
    }),
    /Ara toplam/
  );
  assert.equal(await prisma.order.count(), 0);
});

test("DB kısıtı: KDV oranı 0–10000 baz puan, kalem indirimi negatif ya da satırdan büyük olamaz", async () => {
  const { product, variant } = await createProduct({ priceKurus: 10_000, stock: 5 });
  await assert.rejects(prisma.product.update({ where: { id: product.id }, data: { vatRateBps: 10_001 } }), /products_vat_rate_check/);
  await assert.rejects(prisma.product.update({ where: { id: product.id }, data: { vatRateBps: -1 } }), /products_vat_rate_check/);

  const order = await createOrder({
    guestEmail: "a@example.com",
    guestName: "A B",
    guestPhone: "+905320000000",
    shippingAddress: { firstName: "A", lastName: "B", phone: "+905320000000", city: "Bursa", district: "Orhangazi", address: "Adres satırı 12345" },
    items: [{ variantId: variant.id, snapshotName: "X", snapshotVariant: "1", snapshotPrice: 10_000, quantity: 2 }],
    subtotalKurus: 20_000,
    shippingKurus: 0,
    paymentMethod: "CARD",
    paymentDueAt: new Date(Date.now() + 60_000),
    initialStatus: "PENDING",
  });
  const itemId = order.items[0].id;
  await assert.rejects(prisma.orderItem.update({ where: { id: itemId }, data: { discountKurus: -1 } }), /order_items_discount_check/);
  await assert.rejects(prisma.orderItem.update({ where: { id: itemId }, data: { discountKurus: 20_001 } }), /order_items_discount_check/);
});
