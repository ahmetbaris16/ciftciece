/**
 * Sipariş e-postaları uçtan uca: olay → kural → kuyruk → SMTP (sahte sunucu, gerçek protokol).
 * Sipariş teyidi (yasal) sözleşmelerin siparişe özel hâlini içerir; her adımda müşteriye doğru e-posta gider;
 * işletmeye yeni sipariş/talep/mesaj bildirimi; müşteri verisi e-postada kaçışlanır.
 */

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { processOutbox } from "@/lib/notifications/dispatcher";
import { sendDueEmails } from "@/lib/notifications/sender";
import { saveBusinessInfo } from "@/lib/business/business.repository";
import { parseBusinessInfo } from "@/lib/business/info";
import { confirmBankTransferPayment } from "@/lib/payment/offline";
import { releaseExpiredOrders, updateOrderStatus } from "@/lib/repositories/order.repository";
import { createCustomerRequest, recordRefund, shipOrder } from "@/lib/orders/lifecycle";
import { enqueueTransferReminders } from "@/lib/orders/reminders";
import { writeOutbox } from "@/lib/outbox";
import { customMessageDraft } from "@/lib/notifications/order-rules";
import { enqueueEmail } from "@/lib/notifications/queue";
import { resetTransportCache } from "@/lib/email/transport";
import { enableBankTransfer, setupTestDb } from "./helpers/db";
import { createTestOrder, makeOverdue } from "./helpers/orders";
import { FakeSmtpServer, partOf, subjectOf } from "./helpers/fake-smtp";

setupTestDb();
const smtp = new FakeSmtpServer();

before(async () => {
  await smtp.start();
  Object.assign(process.env, smtp.env());
  resetTransportCache();
});
after(async () => {
  await smtp.stop();
  for (const k of Object.keys(smtp.env())) delete process.env[k];
});
beforeEach(async () => {
  smtp.received.length = 0;
  await saveBusinessInfo({
    ...parseBusinessInfo(null),
    type: "PERSON",
    legalName: "Ece Çiftçi",
    taxOffice: "Orhangazi",
    taxNumber: "10000000146",
    email: "bilgi@ornek-magaza.test",
    notificationEmail: "siparis-bildirim@ornek-magaza.test",
  });
  await enableBankTransfer();
});

async function flush() {
  await processOutbox();
  await sendDueEmails();
}

const emails = (orderId?: string) =>
  prisma.emailMessage.findMany({ where: orderId ? { orderId } : {}, orderBy: { createdAt: "asc" } });

test("havale siparişi: müşteriye teyit + IBAN + siparişe özel sözleşmeler, işletmeye yeni sipariş", async () => {
  const { order } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  await flush();
  const list = await emails(order.id);
  assert.deepEqual(list.map((e) => e.kind).sort(), ["ORDER_RECEIVED", "STORE_NEW_ORDER"]);
  const customer = list.find((e) => e.kind === "ORDER_RECEIVED")!;
  assert.equal(customer.toAddress, "musteri@example.com");
  assert.equal(customer.replyTo, "bilgi@ornek-magaza.test");
  assert.match(customer.subject, new RegExp(order.reference));
  for (const part of ["TR33 0006 1005 1978 6457 8413 26", "Test Bankası", "Ön Bilgilendirme Formu", "Mesafeli Satış Sözleşmesi", "Ece Çiftçi", "10000000146", "14 (on dört) gün"]) {
    assert.ok(customer.html.includes(part), `HTML'de yok: ${part}`);
  }
  assert.ok(customer.text.includes(order.reference), "düz metin sürümünde sipariş no");
  const store = list.find((e) => e.kind === "STORE_NEW_ORDER")!;
  assert.equal(store.toAddress, "siparis-bildirim@ornek-magaza.test");
  assert.equal(store.replyTo, "musteri@example.com");
  assert.equal(smtp.received.length, 2);
  const received = smtp.received.find((m) => m.to[0] === "musteri@example.com")!;
  assert.match(subjectOf(received.raw), /Siparişiniz alındı/);
  assert.match(partOf(received.raw, "text/html"), /Mesafeli Satış Sözleşmesi/);
});

test("havale onayı → ödeme alındı; kargo → takip numaralı e-posta; teslim → teslim e-postası", async () => {
  const { order } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  await confirmBankTransferPayment(order.id, "admin-1");
  await shipOrder(order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "112233445566" }, "admin-1");
  await updateOrderStatus(order.id, "DELIVERED", "admin-1");
  await flush();
  const kinds = (await emails(order.id)).map((e) => e.kind);
  assert.deepEqual(kinds, ["ORDER_RECEIVED", "STORE_NEW_ORDER", "PAYMENT_RECEIVED", "ORDER_SHIPPED", "ORDER_DELIVERED"]);
  const shipped = (await emails(order.id)).find((e) => e.kind === "ORDER_SHIPPED")!;
  assert.ok(shipped.html.includes("112233445566"));
  assert.ok(shipped.html.includes("yurticikargo.com"));
  // Aynı olaylar yeniden işlense de e-posta çoğalmaz
  await prisma.outboxEvent.updateMany({ data: { publishedAt: null } });
  await processOutbox();
  assert.equal((await emails(order.id)).length, 5);
});

test("kartla ödenmemiş sipariş e-posta üretmez; süre dolunca iptal e-postası 'ödeme tamamlanmadı' der", async () => {
  const { order } = await createTestOrder({ method: "CARD", dueInMinutes: 30 });
  await flush();
  assert.equal((await emails(order.id)).length, 0, "ödeme bekleyen kart siparişinde teyit gitmez");
  await makeOverdue(order.id);
  await releaseExpiredOrders(new Date(), { cardGraceMs: 0 });
  await flush();
  const list = await emails(order.id);
  assert.deepEqual(list.map((e) => e.kind), ["ORDER_CANCELLED"]);
  assert.match(list[0].html, /Kart ödemesi tamamlanmadığı için/);
});

test("ödenmiş siparişin iadeyle kapanması tek e-posta: 'iadeniz yapıldı, siparişiniz iptal edildi'", async () => {
  const { order } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  await confirmBankTransferPayment(order.id, "admin-1");
  await flush();
  await recordRefund(order.id, { amountKurus: order.totalKurus, method: "BANK_TRANSFER", reason: "Müşteri vazgeçti", close: true }, "admin-1");
  await flush();
  const after = (await emails(order.id)).map((e) => e.kind);
  assert.ok(after.includes("REFUND_RECORDED"));
  assert.ok(!after.includes("ORDER_CANCELLED"), "iptal ayrıca e-postalanmaz");
  const refund = (await emails(order.id)).find((e) => e.kind === "REFUND_RECORDED")!;
  assert.match(refund.html, /iadeniz/i);
  assert.match(refund.html, /iptal edildi/);
});

test("müşteri talebi: müşteriye alındı, işletmeye talep e-postası", async () => {
  const { order } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  await confirmBankTransferPayment(order.id, "admin-1");
  await createCustomerRequest(order.reference, { type: "CANCEL", message: "Adresim değişti, iptal edin." });
  await flush();
  const list = await emails(order.id);
  const store = list.find((e) => e.kind === "STORE_CUSTOMER_REQUEST")!;
  assert.ok(store.html.includes("Adresim değişti"));
  assert.equal(store.replyTo, "musteri@example.com");
  assert.ok(list.some((e) => e.kind === "REQUEST_RECEIVED"));
});

test("havale hatırlatması: son ödemeye 12 saatten az kala bir kez; süresi geçince gönderilmez", async () => {
  const { order } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 6 * 60 });
  // Sipariş 10 saat önce verilmiş gibi
  await prisma.order.update({ where: { id: order.id }, data: { createdAt: new Date(Date.now() - 10 * 3_600_000) } });
  assert.equal(await enqueueTransferReminders(), 1);
  assert.equal(await enqueueTransferReminders(), 0, "ikinci kez yazılmaz");
  await processOutbox();
  const reminder = (await emails(order.id)).find((e) => e.kind === "TRANSFER_REMINDER")!;
  assert.ok(reminder.expiresAt, "son ödeme geçince gönderilmesin");
  // Son ödeme geçti: kuyruktaki hatırlatma iptal olur
  await prisma.emailMessage.update({ where: { id: reminder.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await sendDueEmails();
  assert.equal((await prisma.emailMessage.findUniqueOrThrow({ where: { id: reminder.id } })).status, "CANCELLED");
});

test("iletişim mesajı işletmeye gider, yanıtla adresi müşteri; müşteri adı e-postada kaçışlanır", async () => {
  const msg = await prisma.contactMessage.create({
    data: { name: "<script>alert(1)</script> Ayşe", email: "ayse@ornek.test", subject: "Ürün bilgisi", message: "Sızma zeytinyağı stokta mı?" },
  });
  await prisma.$transaction((tx) =>
    writeOutbox(tx, { topic: "contact.received", aggregateType: "contact", aggregateId: msg.id, dedupeKey: `contact:${msg.id}`, payload: { messageId: msg.id } })
  );
  await flush();
  const e = await prisma.emailMessage.findFirstOrThrow({ where: { kind: "STORE_CONTACT_MESSAGE" } });
  assert.equal(e.replyTo, "ayse@ornek.test");
  assert.ok(!e.html.includes("<script>"), "HTML kaçışlanmalı");
  assert.ok(e.html.includes("&lt;script&gt;"));
});

test("admin mesajı: aynı anahtarla bir kez kuyruğa girer; müşteriye kaçışlanmış, sipariş bağlantılı gider", async () => {
  const { order } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 60 });
  await flush();
  smtp.received.length = 0;
  const message = "Merhaba <b>kalın</b>\nZeytinler bu hafta hasat edildi.";
  const draft = await customMessageDraft(order.id, "Ürün bilgisi", message, "nonce-12345678");
  assert.ok(draft);
  assert.equal(await enqueueEmail(prisma, draft), true);
  // Çift tıklama / yeniden deneme: aynı anahtar ikinci e-posta oluşturmaz
  const again = await customMessageDraft(order.id, "Ürün bilgisi", message, "nonce-12345678");
  assert.equal(await enqueueEmail(prisma, again!), false);
  await sendDueEmails();

  assert.equal(smtp.received.length, 1);
  const raw = smtp.received[0].raw;
  assert.match(subjectOf(raw), new RegExp(`Ürün bilgisi — #${order.reference}`));
  const html = partOf(raw, "text/html");
  assert.ok(!html.includes("<b>kalın</b>"), "HTML kaçışlanmalı");
  assert.ok(html.includes(`/siparis/${order.reference}`));
  const row = await prisma.emailMessage.findFirstOrThrow({ where: { orderId: order.id, kind: "CUSTOM_MESSAGE" } });
  assert.equal(row.status, "SENT");
  assert.equal(row.replyTo, "bilgi@ornek-magaza.test");
});
