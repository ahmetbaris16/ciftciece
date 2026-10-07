/**
 * Kargo takip numarası: Yurtiçi gönderi kodu yalnız rakam, çoğunlukla 12 hane (11–14 olabilir). Biçime uymayan
 * numara yönetici onayı ("numara doğru") olmadan kaydedilmez; 6–40 karakter dışı hiç kaydedilmez.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { OrderTransitionError } from "@/lib/repositories/order.repository";
import { UnusualTrackingNumberError, shipOrder } from "@/lib/orders/lifecycle";
import { normalizeTrackingNumber, trackingFormatIssue } from "@/lib/shipping/carriers";
import { setupTestDb } from "./helpers/db";
import { createPaidTransferOrder } from "./helpers/orders";

setupTestDb();

const YURTICI = "Yurtiçi Kargo";
// 2026-10-07'de panelde denenen numara (39 karakter, harfli)
const TRIED = "0123456789ASDFGHJKL123456789THNASD12345";

test("Yurtiçi: fişteki gruplama (boşluk, tire, nokta) atılır; diğer firmada tire korunur", () => {
  assert.equal(normalizeTrackingNumber("1234 5678 9012", YURTICI), "123456789012");
  assert.equal(normalizeTrackingNumber("1234-5678-9012", YURTICI), "123456789012");
  assert.equal(normalizeTrackingNumber("1234.5678.9012", YURTICI), "123456789012");
  assert.equal(normalizeTrackingNumber("ab-12 34", "Başka Kargo"), "AB-1234");
});

test("Yurtiçi biçimi: 11–14 hane rakam uyar; harfli ya da kısa/uzun numara açıklamayla işaretlenir", () => {
  for (const ok of ["12345678901", "123456789012", "1234567890123", "12345678901234"]) {
    assert.equal(trackingFormatIssue(YURTICI, ok), null, ok);
  }
  assert.match(trackingFormatIssue(YURTICI, TRIED) ?? "", /rakam dışında karakter/);
  assert.match(trackingFormatIssue(YURTICI, "1234567") ?? "", /7 hane/);
  assert.match(trackingFormatIssue(YURTICI, "1".repeat(20)) ?? "", /20 hane/);
  assert.match(trackingFormatIssue(YURTICI, TRIED) ?? "", /çoğunlukla 12 hane/);
  // Biçimi tanımlı olmayan firma (Diğer): uyarı yok
  assert.equal(trackingFormatIssue("Başka Kargo", TRIED), null);
});

test("kargolama: biçime uymayan numara onaysız reddedilir, onayla kaydedilir; kısa numara hiç kaydedilmez", async () => {
  const { order } = await createPaidTransferOrder();
  await assert.rejects(
    shipOrder(order.id, { carrier: YURTICI, trackingNumber: TRIED }, "admin-1"),
    (err: unknown) => err instanceof UnusualTrackingNumberError && /Numara doğru/.test(err.message)
  );
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, "PAID", "durum değişmedi");
  assert.equal(await prisma.shipment.count(), 0);

  await assert.rejects(
    shipOrder(order.id, { carrier: YURTICI, trackingNumber: "12345", confirmUnusual: true }, "admin-1"),
    (err: unknown) => err instanceof OrderTransitionError && /geçersiz/.test(err.message) && /en az 6/.test(err.message)
  );

  const shipment = await shipOrder(order.id, { carrier: YURTICI, trackingNumber: TRIED, confirmUnusual: true }, "admin-1");
  assert.equal(shipment.trackingNumber, TRIED);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, "SHIPPED");
});

test("kargolama: 12 haneli Yurtiçi kodu onaysız kaydedilir; gruplu yazılan numara birleşir", async () => {
  const { order } = await createPaidTransferOrder();
  const shipment = await shipOrder(order.id, { carrier: YURTICI, trackingNumber: "4012 3456 7890" }, "admin-1");
  assert.equal(shipment.trackingNumber, "401234567890");
  assert.match(shipment.trackingLink ?? "", /code=401234567890/);
});
