/**
 * Admin paneli: sipariş listesi filtreleri / arama ve bekleyen iş rozetleri gerçek veritabanında doğru sayar.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { confirmBankTransferPayment } from "@/lib/payment/offline";
import { createCustomerRequest } from "@/lib/orders/lifecycle";
import { ORDER_FILTERS, countOrdersByFilter, nextStepHint, parseFilter, searchOrdersForAdmin, type OrderFilter } from "@/lib/admin/orders";
import { getAdminBadges, getDashboardStats } from "@/lib/admin/dashboard";
import { setupTestDb } from "./helpers/db";
import { createTestOrder } from "./helpers/orders";

setupTestDb();

const refs = (rows: Array<{ reference: string }>) => rows.map((r) => r.reference).sort();

test("aşamalar: ödeme bekleniyor, kargolanacak, dikkat, müşteri talebi; sayılar; her sipariş bir aşamada", async () => {
  const transfer = (await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 })).order;
  const paid = (await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 })).order;
  await confirmBankTransferPayment(paid.id, "admin-1");
  const cod = (await createTestOrder({ method: "CASH_ON_DELIVERY", dueInMinutes: null })).order;
  const flagged = (await createTestOrder({ method: "CARD" })).order;
  await prisma.order.update({ where: { id: flagged.id }, data: { needsAttention: true } });
  await createCustomerRequest(paid.reference, { type: "CANCEL", message: "Yanlışlıkla iki kez sipariş verdim." });

  // Ödeme bekleniyor: havale + ödemesi tamamlanmamış kart siparişi (kart siparişi önceden hiçbir aşamada görünmüyordu)
  assert.deepEqual(refs((await searchOrdersForAdmin({ filter: "odeme" })).rows), [flagged.reference, transfer.reference].sort());
  assert.equal(parseFilter("havale"), "odeme"); // eski bağlantı
  // İptal isteği karar bekleyen ödenmiş sipariş kargolanacaklarda değil, "Müşteri talebi"nde
  assert.deepEqual(refs((await searchOrdersForAdmin({ filter: "kargolanacak" })).rows), [cod.reference]);
  assert.deepEqual(refs((await searchOrdersForAdmin({ filter: "dikkat" })).rows), [flagged.reference]);
  const talep = await searchOrdersForAdmin({ filter: "talep" });
  assert.deepEqual(refs(talep.rows), [paid.reference]);
  assert.equal(talep.rows[0].openRequests, 1);
  assert.equal((await searchOrdersForAdmin({})).total, 4);

  const counts = await countOrdersByFilter();
  assert.deepEqual(
    { tum: counts.tum, odeme: counts.odeme, kargolanacak: counts.kargolanacak, talep: counts.talep, dikkat: counts.dikkat, kargoda: counts.kargoda },
    { tum: 4, odeme: 2, kargolanacak: 1, talep: 1, dikkat: 1, kargoda: 0 }
  );
  // Tümü dışında her sipariş en az bir aşamada
  const stages = (Object.keys(ORDER_FILTERS) as OrderFilter[]).filter((f) => f !== "tum");
  const seen = new Set<string>();
  for (const f of stages) for (const r of (await searchOrdersForAdmin({ filter: f })).rows) seen.add(r.reference);
  assert.equal(seen.size, 4);

  assert.equal(nextStepHint({ status: "PENDING", paymentMethod: "BANK_TRANSFER", needsAttention: false, openRequests: 0 }), "Havale gelince onaylayın");
  assert.equal(nextStepHint({ status: "PROCESSING", paymentMethod: "CASH_ON_DELIVERY", needsAttention: false, openRequests: 0 }), "Kargoya verin (kapıda ödeme)");
  assert.equal(nextStepHint({ status: "PAID", paymentMethod: "CARD", needsAttention: false, openRequests: 1 }), "Müşteri talebine karar verin");
  assert.equal(nextStepHint({ status: "DELIVERED", paymentMethod: "CARD", needsAttention: false, openRequests: 0 }), null);

  const b = await getAdminBadges();
  assert.equal(b.pendingTransfers, 1);
  assert.equal(b.toShip, 1);
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
