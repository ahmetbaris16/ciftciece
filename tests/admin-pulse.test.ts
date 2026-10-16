/**
 * Panelin kendiliğinden güncellenmesi: özet ucundaki değişim damgası yeni sipariş, ödeme, durum değişikliği ve mesajla
 * değişir; hiçbir şey olmadıysa aynı kalır (açık sayfa boşuna yenilenmesin).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { getAdminPulse } from "@/lib/admin/dashboard";
import { setupTestDb } from "./helpers/db";
import { createTestOrder } from "./helpers/orders";

setupTestDb();

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("hiçbir şey değişmediyse damga aynı kalır", async () => {
  const a = await getAdminPulse();
  const b = await getAdminPulse();
  assert.equal(a.stamp, b.stamp);
});

test("yeni sipariş, durum değişikliği ve yeni mesaj damgayı değiştirir; rozetler güncellenir", async () => {
  const empty = await getAdminPulse();

  const { order } = await createTestOrder({ method: "BANK_TRANSFER" });
  const afterOrder = await getAdminPulse();
  assert.notEqual(afterOrder.stamp, empty.stamp, "yeni sipariş");
  assert.equal(afterOrder.badges.pendingTransfers, 1, "havale bekleyen rozeti");

  await wait(1100); // updatedAt saniye altı değişimi de görür, yine de ardışık yazımları ayırt etmek için bekle
  await prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } });
  const afterPaid = await getAdminPulse();
  assert.notEqual(afterPaid.stamp, afterOrder.stamp, "ödeme/durum değişikliği");
  assert.equal(afterPaid.badges.toShip, 1, "kargolanacak rozeti");

  await prisma.contactMessage.create({ data: { name: "A", email: "a@example.test", subject: "Merhaba", message: "Mesaj" } });
  const afterMessage = await getAdminPulse();
  assert.notEqual(afterMessage.stamp, afterPaid.stamp, "yeni mesaj");
  assert.equal(afterMessage.badges.newMessages, 1);

  // Mesaj okundu: rozet düşer, damga değişir
  await wait(50);
  await prisma.contactMessage.updateMany({ data: { status: "READ" } });
  const afterRead = await getAdminPulse();
  assert.notEqual(afterRead.stamp, afterMessage.stamp, "mesaj okundu");
  assert.equal(afterRead.badges.newMessages, 0);
});
