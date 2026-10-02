/**
 * Admin paneli: sipariş listesi filtreleri / arama ve bekleyen iş rozetleri gerçek veritabanında doğru sayar.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { confirmBankTransferPayment } from "@/lib/payment/offline";
import { createCustomerRequest } from "@/lib/orders/lifecycle";
import { searchOrdersForAdmin } from "@/lib/admin/orders";
import { getAdminBadges, getDashboardStats } from "@/lib/admin/dashboard";
import { listCustomers } from "@/lib/admin/customers";
import { setupTestDb } from "./helpers/db";
import { createTestOrder } from "./helpers/orders";

setupTestDb();

const refs = (rows: Array<{ reference: string }>) => rows.map((r) => r.reference).sort();

test("filtreler: kargolanacak, havale bekleyen, dikkat, müşteri talebi", async () => {
  const transfer = (await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 })).order;
  const paid = (await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 })).order;
  await confirmBankTransferPayment(paid.id, "admin-1");
  const cod = (await createTestOrder({ method: "CASH_ON_DELIVERY", dueInMinutes: null })).order;
  const flagged = (await createTestOrder({ method: "CARD" })).order;
  await prisma.order.update({ where: { id: flagged.id }, data: { needsAttention: true } });
  await createCustomerRequest(paid.reference, { type: "CANCEL", message: "Yanlışlıkla iki kez sipariş verdim." });

  assert.deepEqual(refs((await searchOrdersForAdmin({ filter: "havale" })).rows), [transfer.reference]);
  assert.deepEqual(refs((await searchOrdersForAdmin({ filter: "kargolanacak" })).rows), refs([paid, cod]));
  assert.deepEqual(refs((await searchOrdersForAdmin({ filter: "dikkat" })).rows), [flagged.reference]);
  const talep = await searchOrdersForAdmin({ filter: "talep" });
  assert.deepEqual(refs(talep.rows), [paid.reference]);
  assert.equal(talep.rows[0].openRequests, 1);
  assert.equal((await searchOrdersForAdmin({})).total, 4);

  const b = await getAdminBadges();
  assert.equal(b.pendingTransfers, 1);
  assert.equal(b.toShip, 2);
  assert.equal(b.attention, 1);
  assert.equal(b.openRequests, 1);

  const stats = await getDashboardStats();
  assert.equal(stats.todayOrders, 4);
  // Yalnız onaylanan havale: kapıda ödemeli sipariş teslimde tahsil edilene kadar ciroya girmez
  assert.equal(stats.monthPaidOrders, 1);
  assert.equal(stats.monthRevenueKurus, paid.totalKurus);
  assert.equal(stats.monthRefundKurus, 0);
});

test("arama: sipariş no, ad, e-posta ve telefon (0 ile ya da +90 ile); sayfalama", async () => {
  const { order } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 60 });
  for (const q of [order.reference, `#${order.reference.slice(0, 8)}`, "test müşteri", "MUSTERI@example", "0532 000 00 00", "+90 532 000"]) {
    const r = await searchOrdersForAdmin({ q });
    assert.equal(r.total, 1, `arama: ${q}`);
  }
  assert.equal((await searchOrdersForAdmin({ q: "olmayan-kisi" })).total, 0);

  for (let i = 0; i < 6; i++) await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 60 });
  const p1 = await searchOrdersForAdmin({ perPage: 5, page: 1 });
  const p2 = await searchOrdersForAdmin({ perPage: 5, page: 2 });
  assert.equal(p1.pages, 2);
  assert.equal(p1.rows.length, 5);
  assert.equal(p2.rows.length, 2);
  assert.equal(new Set([...refs(p1.rows), ...refs(p2.rows)]).size, 7);
});

test("müşteriler: e-postaya göre toplanır; ödenen tutar yalnız ödenmiş siparişlerden; arama", async () => {
  const { order: a } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 60, priceKurus: 10_000 });
  const { order: b } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 60, priceKurus: 25_000 });
  await confirmBankTransferPayment(b.id, "admin-1");
  await prisma.order.update({ where: { id: a.id }, data: { guestEmail: "baska@example.com", guestName: "Başka Kişi" } });
  // Aynı e-postada yönetici hesabı "Üye" sayılmaz (mağazaya üye girişi yapamaz); müşteri hesabı sayılır
  await prisma.user.create({ data: { email: "baska@example.com", role: "ADMIN", username: "baska" } });
  await prisma.user.create({ data: { email: "musteri@example.com", role: "CUSTOMER" } });

  const all = await listCustomers({});
  assert.equal(all.members, 1);
  assert.equal(all.total, 2);
  const musteri = all.rows.find((r) => r.email === "musteri@example.com");
  assert.ok(musteri);
  assert.equal(musteri.orders, 1);
  assert.equal(musteri.paidOrders, 1);
  assert.equal(musteri.paidKurus, 25_000);
  assert.deepEqual([musteri.member, musteri.staff], [true, false]);
  const baska = all.rows.find((r) => r.email === "baska@example.com");
  assert.equal(baska?.paidKurus, 0);
  assert.equal(baska?.name, "Başka Kişi");
  assert.deepEqual([baska?.member, baska?.staff], [false, true]);

  assert.deepEqual(
    (await listCustomers({ q: "başka" })).rows.map((r) => r.email),
    ["baska@example.com"]
  );
});
