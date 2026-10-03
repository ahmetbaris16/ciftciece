/**
 * Sipariş sonrası süreçler: geçmiş kaydı, kargolama (takip numarası zorunlu), iade kaydı (R-07), müşteri
 * iptali ve talepleri, fatura numarası, süre dolumu. Her işlem geçmiş + bildirim olayıyla birlikte yazılır.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { confirmBankTransferPayment } from "@/lib/payment/offline";
import {
  OrderTransitionError,
  releaseExpiredOrders,
  updateOrderStatus,
} from "@/lib/repositories/order.repository";
import {
  cancelByCustomer,
  createCustomerRequest,
  recordRefund,
  rejectCustomerRequest,
  setInvoice,
  shipOrder,
} from "@/lib/orders/lifecycle";
import { searchOrdersForAdmin } from "@/lib/admin/orders";
import { getAdminBadges } from "@/lib/admin/dashboard";
import { setupTestDb, stockOf } from "./helpers/db";
import { createTestOrder, makeOverdue, orderState } from "./helpers/orders";

setupTestDb();

const isTransition = (re: RegExp) => (err: unknown) => err instanceof OrderTransitionError && re.test(err.message);

async function paidTransferOrder(opts: { stock?: number; quantity?: number } = {}) {
  const t = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60, ...opts });
  await confirmBankTransferPayment(t.order.id, "admin-1");
  return t;
}

const events = (orderId: string) =>
  prisma.orderEvent.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
const topics = async (orderId: string) =>
  (await prisma.outboxEvent.findMany({ where: { aggregateId: orderId }, orderBy: { createdAt: "asc" } })).map((e) => e.topic);

test("sipariş oluşunca geçmişe 'oluşturuldu' ve kuyruğa 'order.placed' yazılır", async () => {
  const { order } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 60 });
  const ev = await events(order.id);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, "CREATED");
  assert.equal(ev[0].visibleToCustomer, true);
  assert.match(ev[0].message, /havale/i);
  assert.deepEqual(await topics(order.id), ["order.placed"]);
});

test("havale → ödendi → hazırlanıyor → kargo (takip no) → teslim: geçmiş ve olaylar sırayla", async () => {
  const { order } = await paidTransferOrder();
  await updateOrderStatus(order.id, "PROCESSING", "admin-1");
  // Takip numarasız "kargoya verildi" yapılamaz (R-22)
  await assert.rejects(updateOrderStatus(order.id, "SHIPPED", "admin-1"), isTransition(/takip numarası/));
  const shipment = await shipOrder(order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "1234 5678 9012" }, "admin-1");
  assert.equal(shipment.trackingNumber, "123456789012");
  assert.match(shipment.trackingLink ?? "", /yurticikargo\.com.*code=123456789012/);
  await updateOrderStatus(order.id, "DELIVERED", "admin-1");

  assert.equal((await orderState(order.id)).status, "DELIVERED");
  const ev = await events(order.id);
  assert.deepEqual(
    ev.map((e) => e.type),
    ["CREATED", "PAYMENT", "STATUS", "STATUS", "SHIPMENT", "STATUS"]
  );
  const visible = ev.filter((e) => e.visibleToCustomer).map((e) => e.message);
  assert.ok(visible.some((m) => m.includes("Havale/EFT ödemeniz alındı")));
  assert.ok(visible.some((m) => m.includes("Takip no: 123456789012")));
  assert.ok(visible.some((m) => m.includes("teslim edildi")));
  assert.deepEqual(await topics(order.id), [
    "order.placed",
    "order.paid",
    "order.status_changed",
    "order.shipped",
    "order.status_changed",
  ]);
});

test("kargolama kuralları: ödenmemiş ve ödemesi incelemedeki sipariş kargolanmaz; aynı takip no iki kez girilmez", async () => {
  const pending = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 60 });
  await assert.rejects(
    shipOrder(pending.order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "111111111111" }, "a"),
    isTransition(/Ödemesi alınmamış/)
  );
  const paid = await paidTransferOrder();
  await prisma.order.update({ where: { id: paid.order.id }, data: { needsAttention: true } });
  await assert.rejects(
    shipOrder(paid.order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "222222222222" }, "a"),
    isTransition(/kontrol ediliyor/)
  );
  await prisma.order.update({ where: { id: paid.order.id }, data: { needsAttention: false } });
  await shipOrder(paid.order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "333333333333" }, "a");
  // Ek koli: kargodaki siparişe ikinci gönderi
  await shipOrder(paid.order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "444444444444" }, "a");
  assert.equal(await prisma.shipment.count({ where: { orderId: paid.order.id } }), 2);
  const other = await paidTransferOrder();
  await assert.rejects(
    shipOrder(other.order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "333333333333" }, "a"),
    isTransition(/başka bir gönderide/)
  );
  await assert.rejects(
    shipOrder(other.order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "12" }, "a"),
    isTransition(/geçersiz/)
  );
});

test("ödenmiş sipariş iade kaydı olmadan iptal edilemez; kısmi iadede sürer, tam iadeyle kendiliğinden kapanır, stok geri döner", async () => {
  const { order, variant } = await paidTransferOrder({ stock: 10, quantity: 2 });
  assert.equal(await stockOf(variant.id), 8);
  await assert.rejects(updateOrderStatus(order.id, "CANCELLED", "admin-1"), isTransition(/iade kaydını girin/));

  // Kısmi iade: durum değişmez, sipariş hazırlanmaya devam edebilir
  await recordRefund(order.id, { amountKurus: 1000, method: "BANK_TRANSFER", reason: "Eksik ürün" }, "admin-1");
  assert.equal((await orderState(order.id)).status, "PAID");
  // Fazlası kabul edilmez (işlem kayıt bırakmaz)
  await assert.rejects(
    recordRefund(order.id, { amountKurus: order.totalKurus, method: "BANK_TRANSFER", reason: "x x x" }, "admin-1"),
    isTransition(/aşıyor/)
  );
  assert.equal(await prisma.refund.count({ where: { orderId: order.id } }), 1);
  await updateOrderStatus(order.id, "PROCESSING", "admin-1");

  // Kalanın iadesi = tam iade → sipariş kendiliğinden kapanır ("kapat" seçeneği yok: iade edilip açık kalamaz)
  await recordRefund(
    order.id,
    { amountKurus: order.totalKurus - 1000, method: "BANK_TRANSFER", reference: "DEKONT-1", reason: "Müşteri vazgeçti" },
    "admin-1"
  );
  assert.equal((await orderState(order.id)).status, "CANCELLED");
  assert.equal(await stockOf(variant.id), 10, "kargolanmamış sipariş iptalinde stok geri döner");
  const statusEvents = await prisma.outboxEvent.findMany({ where: { aggregateId: order.id, topic: "order.status_changed" } });
  const cancelEvent = statusEvents.find((e) => (e.payload as Record<string, unknown>).to === "CANCELLED");
  assert.ok((cancelEvent?.payload as Record<string, unknown> | undefined)?.refundId, "iade ile kapanış tek e-posta için işaretli");
  assert.equal(await prisma.outboxEvent.count({ where: { aggregateId: order.id, topic: "order.refunded" } }), 2);
});

test("teslim edilmiş siparişin iadesi: REFUNDED; stok yalnız istenirse geri eklenir", async () => {
  const a = await paidTransferOrder({ stock: 5, quantity: 1 });
  await shipOrder(a.order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "555555555555" }, "x");
  await updateOrderStatus(a.order.id, "DELIVERED", "x");
  await recordRefund(a.order.id, { amountKurus: a.order.totalKurus, method: "BANK_TRANSFER", reason: "Cayma" }, "x");
  assert.equal((await orderState(a.order.id)).status, "REFUNDED");
  assert.equal(await stockOf(a.variant.id), 4, "varsayılan: geri gelen gıda stoğa eklenmez");

  const b = await paidTransferOrder({ stock: 5, quantity: 1 });
  await shipOrder(b.order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "666666666666" }, "x");
  await updateOrderStatus(b.order.id, "DELIVERED", "x");
  await recordRefund(
    b.order.id,
    { amountKurus: b.order.totalKurus, method: "BANK_TRANSFER", reason: "Açılmamış iade", restock: true },
    "x"
  );
  assert.equal(await stockOf(b.variant.id), 5);
});

test("kapıda ödeme: geri dönen paket iade kaydı gerektirmeden iptal, stok geri döner", async () => {
  const { order, variant } = await createTestOrder({ method: "CASH_ON_DELIVERY", dueInMinutes: null, stock: 3 });
  assert.equal(await stockOf(variant.id), 2);
  await shipOrder(order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "777777777777" }, "x");
  await updateOrderStatus(order.id, "CANCELLED", "x", { reason: "paket teslim alınmadı" });
  assert.equal((await orderState(order.id)).status, "CANCELLED");
  assert.equal(await stockOf(variant.id), 3);
  // Ödemesi alınmamış siparişte iade kaydı girilmez
  await assert.rejects(
    recordRefund(order.id, { amountKurus: 100, method: "CASH", reason: "x x x" }, "x"),
    isTransition(/alınmış bir ödemesi yok/)
  );
});

test("müşteri: ödenmemiş siparişi iptal eder; ödenmişte iptal isteği, teslimde iade bildirimi açar", async () => {
  const unpaid = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 60, stock: 4 });
  await cancelByCustomer(unpaid.order.reference);
  assert.equal((await orderState(unpaid.order.id)).status, "CANCELLED");
  assert.equal(await stockOf(unpaid.variant.id), 4);
  const ev = (await events(unpaid.order.id)).at(-1)!;
  assert.equal(ev.actorType, "CUSTOMER");

  const paid = await paidTransferOrder();
  await assert.rejects(cancelByCustomer(paid.order.reference), isTransition(/iptal isteği gönderin/));
  const r1 = await createCustomerRequest(paid.order.reference, { type: "CANCEL", message: "Yanlış ürün seçtim" });
  assert.equal(r1.created, true);
  const r2 = await createCustomerRequest(paid.order.reference, { type: "CANCEL", message: "tekrar" });
  assert.equal(r2.created, false, "açık talep varken yenisi açılmaz");
  await assert.rejects(
    createCustomerRequest(paid.order.reference, { type: "RETURN", message: "" }),
    isTransition(/kargolanmış ya da teslim/)
  );
  assert.equal(await prisma.outboxEvent.count({ where: { aggregateId: paid.order.id, topic: "order.customer_request" } }), 1);
  // Ret: sipariş sürer, müşteri sipariş sayfasında görür; ret sebebi iç not olarak kalır
  await rejectCustomerRequest(r1.request.id, "Sipariş hazırlanmıştı", "admin-1");
  const closed = await prisma.customerRequest.findUniqueOrThrow({ where: { id: r1.request.id } });
  assert.equal(closed.status, "REJECTED");
  assert.equal(closed.resolutionNote, "Sipariş hazırlanmıştı");
  const rejectEvents = (await events(paid.order.id)).filter((e) => e.type === "REQUEST" && e.actorType === "ADMIN");
  assert.equal(rejectEvents.find((e) => e.visibleToCustomer)?.message.includes("kabul edilemedi"), true);
  assert.equal(rejectEvents.find((e) => !e.visibleToCustomer)?.message.includes("Sipariş hazırlanmıştı"), true);
  assert.equal((await orderState(paid.order.id)).status, "PAID");
  await assert.rejects(rejectCustomerRequest(r1.request.id, null, "admin-1"), isTransition(/zaten kapanmış/));
});

test("parası tamamen iade edilmiş ama açık kalmış sipariş (eski kayıt) ilerletilemez, yalnız kapatılır", async () => {
  const { order } = await paidTransferOrder();
  // Bu sürümden önce "siparişi kapat" işaretlenmeden girilmiş tam iade
  await prisma.refund.create({ data: { orderId: order.id, amountKurus: order.totalKurus, method: "OTHER", reason: "eski kayıt" } });
  await assert.rejects(updateOrderStatus(order.id, "PROCESSING", "admin-1"), isTransition(/tamamı iade edilmiş/));
  await assert.rejects(
    shipOrder(order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "888888888888" }, "admin-1"),
    isTransition(/tamamı iade edilmiş/)
  );
  await updateOrderStatus(order.id, "CANCELLED", "admin-1");
  assert.equal((await orderState(order.id)).status, "CANCELLED");

  const shipped = await paidTransferOrder();
  await shipOrder(shipped.order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "999999999999" }, "admin-1");
  await prisma.refund.create({ data: { orderId: shipped.order.id, amountKurus: shipped.order.totalKurus, method: "OTHER", reason: "eski kayıt" } });
  await assert.rejects(updateOrderStatus(shipped.order.id, "DELIVERED", "admin-1"), isTransition(/tamamı iade edilmiş/));
  await updateOrderStatus(shipped.order.id, "REFUNDED", "admin-1");
  assert.equal((await orderState(shipped.order.id)).status, "REFUNDED");
});

test("müşteri iptal istedi: karar verilene kadar hazırlanmaz/kargolanmaz; ret → sürer; tam iade → iptal ve talep kapanır", async () => {
  const a = await paidTransferOrder();
  await createCustomerRequest(a.order.reference, { type: "CANCEL", message: "Vazgeçtim" });
  await assert.rejects(updateOrderStatus(a.order.id, "PROCESSING", "admin-1"), isTransition(/iptalini istedi/));
  await assert.rejects(
    shipOrder(a.order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "121212121212" }, "admin-1"),
    isTransition(/iptalini istedi/)
  );
  // "Kargolanacak" listesinde ve sayacında değil, "Müşteri talebi"nde
  assert.equal((await searchOrdersForAdmin({ filter: "kargolanacak" })).total, 0);
  assert.equal((await searchOrdersForAdmin({ filter: "talep" })).total, 1);
  assert.equal((await getAdminBadges()).toShip, 0);

  const request = await prisma.customerRequest.findFirstOrThrow({ where: { orderId: a.order.id } });
  await rejectCustomerRequest(request.id, "Kargoya hazır", "admin-1");
  await updateOrderStatus(a.order.id, "PROCESSING", "admin-1");
  assert.equal((await searchOrdersForAdmin({ filter: "kargolanacak" })).total, 1);

  const b = await paidTransferOrder({ stock: 5, quantity: 1 });
  await createCustomerRequest(b.order.reference, { type: "CANCEL", message: "Yanlış adres" });
  await recordRefund(b.order.id, { amountKurus: b.order.totalKurus, method: "BANK_TRANSFER", reason: "İptal kabul" }, "admin-1");
  assert.equal((await orderState(b.order.id)).status, "CANCELLED");
  assert.equal(await stockOf(b.variant.id), 5);
  const closedRequest = await prisma.customerRequest.findFirstOrThrow({ where: { orderId: b.order.id } });
  assert.equal(closedRequest.status, "RESOLVED");
  assert.equal(closedRequest.resolutionNote, "Sipariş iptal edildi.");
  // Kapanan sipariş eski sekmedeki düğmeyle de ilerletilemez; mesaj anlaşılır
  await assert.rejects(updateOrderStatus(b.order.id, "PROCESSING", "admin-1"), isTransition(/iptal edildi ve kapandı/));
  await assert.rejects(
    shipOrder(b.order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "131313131313" }, "admin-1"),
    isTransition(/kapandı/)
  );

  // Kapıda ödeme (ödeme alınmamış): iptal isteği "İptal et" ile kabul edilir, talep kendiliğinden kapanır
  const cod = await createTestOrder({ method: "CASH_ON_DELIVERY", dueInMinutes: null });
  await createCustomerRequest(cod.order.reference, { type: "CANCEL", message: "Gerek kalmadı" });
  await updateOrderStatus(cod.order.id, "CANCELLED", "admin-1");
  assert.equal((await prisma.customerRequest.findFirstOrThrow({ where: { orderId: cod.order.id } })).status, "RESOLVED");
});

test("iade (cayma) bildirimi iade kaydıyla kapanır; kısmi iadede teslim edilmiş sipariş sürer, kalanıyla iade edildi olur", async () => {
  const { order } = await paidTransferOrder();
  await shipOrder(order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "343434343434" }, "admin-1");
  await updateOrderStatus(order.id, "DELIVERED", "admin-1");
  await createCustomerRequest(order.reference, { type: "RETURN", message: "Bir kavanoz kırık geldi" });

  await recordRefund(order.id, { amountKurus: 1000, method: "BANK_TRANSFER", reason: "Kırık ürün bedeli" }, "admin-1");
  assert.equal((await orderState(order.id)).status, "DELIVERED");
  const request = await prisma.customerRequest.findFirstOrThrow({ where: { orderId: order.id } });
  assert.equal(request.status, "RESOLVED");
  assert.equal(request.resolutionNote, "İade kaydı girildi.");

  await recordRefund(order.id, { amountKurus: order.totalKurus - 1000, method: "BANK_TRANSFER", reason: "Cayma" }, "admin-1");
  assert.equal((await orderState(order.id)).status, "REFUNDED");
});

test("fatura numarası müşteriye görünen geçmişe yazılır", async () => {
  const { order } = await paidTransferOrder();
  await setInvoice(order.id, { invoiceNumber: "gib2026000000123", issuedAt: new Date() }, "admin-1");
  const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(row.invoiceNumber, "GIB2026000000123");
  const ev = (await events(order.id)).at(-1)!;
  assert.equal(ev.type, "INVOICE");
  assert.equal(ev.visibleToCustomer, true);
  await assert.rejects(setInvoice(order.id, { invoiceNumber: "x", issuedAt: new Date() }, "a"), isTransition(/geçersiz/));
});

test("süre dolumu: iptal geçmişe ve bildirim kuyruğuna yazılır (sebep: ödeme alınmadı)", async () => {
  const { order } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 60 });
  await makeOverdue(order.id);
  assert.equal(await releaseExpiredOrders(), 1);
  const ev = (await events(order.id)).at(-1)!;
  assert.equal(ev.actorType, "SYSTEM");
  assert.match(ev.message, /ödeme alınmadı/);
  const out = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: order.id, topic: "order.status_changed" } });
  assert.equal((out.payload as Record<string, unknown>).expired, true);
});
