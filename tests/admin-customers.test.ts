/**
 * Admin müşterileri: liste (üye/misafir kimliği, sipariş vermemiş üye, filtreler, arama, net tutar), müşteri sayfası
 * verisi (siparişler ve işaretleri, talepler, adresler, yorum/mesaj, yönlendirme) ve üyeye şifre yenileme bağlantısı.
 */

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { confirmBankTransferPayment } from "@/lib/payment/offline";
import { createCustomerRequest, recordRefund, rejectCustomerRequest } from "@/lib/orders/lifecycle";
import { listCustomers, loadAdminCustomer, type AdminCustomerDetail } from "@/lib/admin/customers";
import { sendResetLinkToCustomer } from "@/lib/admin/customer-actions";
import { AdminActionError } from "@/lib/admin/errors";
import { resetPasswordWithToken } from "@/lib/account/password-reset";
import { resetTransportCache } from "@/lib/email/transport";
import { setupTestDb } from "./helpers/db";
import { createTestOrder } from "./helpers/orders";
import { FakeSmtpServer, partOf, subjectOf } from "./helpers/fake-smtp";

setupTestDb();

const smtp = new FakeSmtpServer();
before(async () => {
  await smtp.start();
});
after(async () => {
  await smtp.stop();
  for (const k of Object.keys(smtp.env())) delete process.env[k];
  resetTransportCache();
});

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

async function order(data: Record<string, unknown> = {}, opts: Parameters<typeof createTestOrder>[0] = {}) {
  const { order: o } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 60, ...opts });
  if (Object.keys(data).length) await prisma.order.update({ where: { id: o.id }, data });
  return o;
}

async function customer(key: string): Promise<AdminCustomerDetail> {
  const found = await loadAdminCustomer(key);
  assert.equal(found?.kind, "found", `müşteri sayfası açılmadı: ${key}`);
  return (found as { customer: AdminCustomerDetail }).customer;
}

test("liste: üye/misafir kimliği, sipariş vermemiş üye, yönetici e-postası, filtreler ve arama", async () => {
  // Misafir: e-postası büyük/küçük harf farklı iki sipariş → tek müşteri
  const g1 = await order({ guestEmail: "Ayse@Example.com", guestName: "Ayşe Yılmaz", createdAt: daysAgo(3) });
  await order({ guestEmail: "ayse@example.com", guestName: "Ayşe Yılmaz", guestPhone: "+905551112233", createdAt: daysAgo(2) });
  // Üye: hesabına bağlı (farklı e-postayla) sipariş + üye girişi yapmadan kendi e-postasıyla verdiği sipariş
  const m = await prisma.user.create({ data: { email: "uye@example.com", name: "Mehmet Üye", phone: "+905441234567", role: "CUSTOMER" } });
  await order({ userId: m.id, guestEmail: "is@firma.com" });
  await order({ guestEmail: "UYE@example.com" });
  // Sipariş vermemiş üye
  const yeni = await prisma.user.create({ data: { email: "yeni@example.com", name: "Zeynep Yeni", role: "CUSTOMER" } });
  // Yönetici hesabının e-postasıyla verilmiş sipariş: misafir, "Yönetici hesabı" işaretli
  await prisma.user.create({ data: { email: "patron@example.com", role: "ADMIN", username: "patron" } });
  await order({ guestEmail: "patron@example.com", guestName: "Patron" });

  const all = await listCustomers({});
  assert.deepEqual([all.total, all.members], [4, 2]);
  const row = (email: string) => all.rows.find((r) => r.email.toLowerCase() === email);
  const ayse = row("ayse@example.com");
  assert.ok(ayse);
  // Misafirin adresi ilk siparişinin kimliği; ad/telefon en son siparişten
  assert.deepEqual([ayse.key, ayse.orders, ayse.member, ayse.phone], [g1.id, 2, false, "+905551112233"]);
  const uye = row("uye@example.com");
  assert.ok(uye);
  assert.deepEqual([uye.key, uye.orders, uye.member, uye.name], [m.id, 2, true, "Mehmet Üye"]);
  assert.ok(!all.rows.some((r) => r.email === "is@firma.com"), "üyenin farklı e-postalı siparişi ayrı müşteri görünmez");
  const z = row("yeni@example.com");
  assert.ok(z);
  assert.deepEqual([z.key, z.orders, z.lastOrderAt, z.memberSince?.getTime()], [yeni.id, 0, null, yeni.createdAt.getTime()]);
  const patron = row("patron@example.com");
  assert.deepEqual([patron?.member, patron?.staff], [false, true]);

  const emails = async (opts: Parameters<typeof listCustomers>[0]) =>
    (await listCustomers(opts)).rows.map((r) => r.email.toLowerCase()).sort();
  assert.deepEqual(await emails({ filter: "uye" }), ["uye@example.com", "yeni@example.com"]);
  assert.deepEqual(await emails({ filter: "misafir" }), ["ayse@example.com", "patron@example.com"]);
  // Arama: siparişi olmayan üyenin adı, üyenin telefonu (0 ile), üyenin siparişindeki farklı e-posta
  assert.deepEqual((await listCustomers({ q: "zeynep" })).rows.map((r) => r.key), [yeni.id]);
  assert.deepEqual((await listCustomers({ q: "0544 123 45" })).rows.map((r) => r.key), [m.id]);
  assert.deepEqual((await listCustomers({ q: "is@firma" })).rows.map((r) => r.key), [m.id]);
  assert.equal((await listCustomers({ q: "zeynep", filter: "misafir" })).total, 0);
});

test("tutar: alınan ödeme eksi iade; demo ödeme sayılmaz; liste ile müşteri sayfası aynı", async () => {
  const paid = await order({}, { priceKurus: 25_000 });
  await confirmBankTransferPayment(paid.id, "admin-1");
  await recordRefund(paid.id, { amountKurus: 5_000, method: "BANK_TRANSFER", reason: "Eksik ürün" }, "admin-1");
  await order({}, { priceKurus: 10_000 }); // ödenmedi
  const demo = await order({}, { method: "CARD", priceKurus: 40_000 });
  await prisma.paymentAttempt.create({
    data: { orderId: demo.id, provider: "demo", method: "CARD", status: "SUCCEEDED", amountKurus: 40_000, successOrderId: demo.id, verifiedAt: new Date() },
  });
  await prisma.order.update({ where: { id: demo.id }, data: { status: "PAID" } });

  const { rows } = await listCustomers({});
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].orders, rows[0].netKurus, rows[0].refundedKurus], [3, 20_000, 5_000]);

  const c = await customer(rows[0].key);
  const s = c.stats;
  assert.deepEqual([s.receivedKurus, s.refundedKurus, s.netKurus, s.testKurus], [25_000, 5_000, 20_000, 40_000]);
  // Kısmi iadede sipariş sürer; ödenmemiş ve demo ödenmiş sipariş de açık
  assert.equal(s.openOrders, 3);
  const p = c.orders.find((o) => o.id === paid.id);
  assert.deepEqual([p?.status, p?.receivedKurus, p?.refundedKurus, p?.testPayment], ["PAID", 25_000, 5_000, false]);
  assert.equal(c.orders.find((o) => o.id === demo.id)?.testPayment, true);
});

test("müşteri sayfası: üyenin siparişleri ve işaretleri, talepler, adres, fatura, yorum ve mesaj; yönlendirmeler", async () => {
  const m = await prisma.user.create({ data: { email: "uye@example.com", name: "Mehmet Üye", phone: "+905441234567", role: "CUSTOMER" } });
  const viaAccount = await order({
    userId: m.id,
    guestEmail: "is@firma.com",
    createdAt: daysAgo(1),
    billingInfo: {
      type: "CORPORATE",
      name: "Mehmet Üye",
      companyName: "Üye Gıda Ltd.",
      taxOffice: "Orhangazi",
      taxNumber: "1234567890",
      sameAsShipping: true,
    },
  });
  // Aynı adres farklı yazımla (büyük harf, fazladan boşluk) tek adres sayılır
  const asGuest = await order({
    guestEmail: "uye@example.com",
    shippingAddress: {
      firstName: "Mehmet",
      lastName: "Üye",
      phone: "+905441234567",
      city: "Bursa",
      district: "Orhangazi",
      address: "TEST MAHALLESİ  Deneme Sokak No 1",
    },
  });
  const otherCustomer = await order(); // musteri@example.com: başka müşteri

  await confirmBankTransferPayment(viaAccount.id, "admin-1");
  await confirmBankTransferPayment(asGuest.id, "admin-1");
  await createCustomerRequest(viaAccount.reference, { type: "CANCEL", message: "Vazgeçtim." });
  await createCustomerRequest(asGuest.reference, { type: "CANCEL", message: "İptal edin lütfen." });
  const rejected = await prisma.customerRequest.findFirstOrThrow({ where: { orderId: asGuest.id } });
  await rejectCustomerRequest(rejected.id, "Kargoya verilmişti", "admin-1");

  const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: viaAccount.id }, select: { variant: { select: { productId: true } } } });
  await prisma.productReview.create({ data: { productId: item.variant.productId, userId: m.id, rating: 4, text: "Zeytinler çok taze geldi." } });
  await prisma.contactMessage.create({
    data: { name: "Mehmet", email: "UYE@example.com", subject: "Kargo ne zaman?", message: "Merhaba, kargom ne zaman çıkar?" },
  });

  const c = await customer(m.id);
  assert.deepEqual([c.kind, c.email, c.name], ["member", "uye@example.com", "Mehmet Üye"]);
  assert.deepEqual(
    c.orders.map((o) => o.id),
    [asGuest.id, viaAccount.id]
  );
  const via = c.orders.find((o) => o.id === viaAccount.id);
  assert.deepEqual([via?.viaAccount, via?.otherEmail, via?.openRequests], [true, "is@firma.com", 1]);
  const guest = c.orders.find((o) => o.id === asGuest.id);
  assert.deepEqual([guest?.viaAccount, guest?.otherEmail, guest?.openRequests], [false, null, 0]);
  assert.deepEqual([c.stats.orders, c.stats.accountOrders, c.stats.guestOrders], [2, 1, 1]);
  assert.deepEqual(c.requests.map((r) => r.status).sort(), ["OPEN", "REJECTED"]);
  assert.equal(c.requests.find((r) => r.status === "REJECTED")?.resolutionNote, "Kargoya verilmişti");
  assert.equal(c.addresses.length, 1);
  assert.equal(c.addresses[0].uses, 2);
  assert.deepEqual(
    c.companies.map((x) => [x.companyName, x.taxNumber]),
    [["Üye Gıda Ltd.", "1234567890"]]
  );
  assert.equal(c.phones[0], "+905441234567");
  assert.deepEqual(
    c.reviews.map((r) => [r.rating, r.status]),
    [[4, "PENDING"]]
  );
  assert.deepEqual(
    c.messages.map((x) => x.subject),
    ["Kargo ne zaman?"]
  );
  assert.equal(c.account?.lastResetLink, null);
  assert.equal(c.staff, false);

  // Üyenin siparişiyle açılan sayfa (üye girişiyle verilmiş ya da e-postası üyeninki) üyenin sayfasına yönlenir
  assert.deepEqual(await loadAdminCustomer(viaAccount.id), { kind: "redirect", key: m.id });
  assert.deepEqual(await loadAdminCustomer(asGuest.id), { kind: "redirect", key: m.id });

  // Başka misafir müşteri kendi sayfasında; üyenin siparişleri ona karışmaz
  const other = await customer(otherCustomer.id);
  assert.deepEqual([other.kind, other.account, other.orders.length], ["guest", null, 1]);
  assert.equal(other.reviews.length, 0);

  // Üyenin kullandığı iş e-postasıyla misafir sipariş: ayrı müşteri, üyenin sayfasına bağlantı notuyla
  const workGuest = await order({ guestEmail: "is@firma.com", guestName: "Muhasebe" });
  const work = await customer(workGuest.id);
  assert.deepEqual(
    work.orders.map((o) => o.id),
    [workGuest.id]
  );
  assert.deepEqual(
    work.otherAccounts.map((a) => [a.userId, a.orders]),
    [[m.id, 1]]
  );

  // Yönetici hesabının e-postasıyla verilen sipariş: misafir sayfası, "yönetici hesabı" işaretli
  await prisma.user.create({ data: { email: "patron@example.com", role: "ADMIN", username: "patron" } });
  const staffOrder = await order({ guestEmail: "patron@example.com" });
  assert.equal((await customer(staffOrder.id)).staff, true);

  // Olmayan ya da geçersiz kimlik
  assert.equal(await loadAdminCustomer("olmayan-kimlik"), null);
  assert.equal(await loadAdminCustomer("../../etc"), null);
  // Yönetici hesabının kimliği müşteri sayfası açmaz
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "patron@example.com" } });
  assert.equal(await loadAdminCustomer(admin.id), null);
});

test("şifre yenileme bağlantısı: üyenin e-postasına gider ve çalışır; e-posta ayarı yoksa, üye değilse açık hata", async () => {
  const m = await prisma.user.create({ data: { email: "uye@example.com", name: "Mehmet Üye", role: "CUSTOMER", passwordHash: "eski" } });
  const origin = "http://localhost:3000";

  // E-posta gönderimi ayarlı değil: "gönderildi" denmez
  await assert.rejects(sendResetLinkToCustomer(m.id, "admin-1", origin), (e: unknown) => e instanceof AdminActionError && e.status === 503);

  Object.assign(process.env, smtp.env());
  resetTransportCache();
  const res = await sendResetLinkToCustomer(m.id, "admin-1", origin);
  assert.deepEqual(res, { sentTo: "uye@example.com", mode: "smtp" });
  assert.equal(smtp.received.length, 1);
  const raw = smtp.received[0].raw;
  assert.deepEqual(smtp.received[0].to, ["uye@example.com"]);
  assert.match(subjectOf(raw), /şifre yenileme bağlantınız/);
  const text = partOf(raw, "text/plain");
  assert.match(text, /ekibi üyeliğiniz için şifre yenileme bağlantısı gönderdi/);
  const token = /\/sifre-sifirla\?token=([A-Za-z0-9_%-]+)/.exec(text)?.[1];
  assert.ok(token, "e-postada bağlantı yok");

  assert.equal((await customer(m.id)).account?.lastResetLink?.state, "valid");
  const audit = await prisma.auditLog.findFirst({ where: { action: "customer.password_reset_link", entityId: m.id } });
  assert.equal(audit?.userId, "admin-1");

  // Bağlantıyı müşteri kullanır: şifre değişir, sayfada "kullanıldı"
  assert.equal(await resetPasswordWithToken(decodeURIComponent(token), "yeni-hash"), "ok");
  const after_ = await prisma.user.findUniqueOrThrow({ where: { id: m.id } });
  assert.equal(after_.passwordHash, "yeni-hash");
  const page = await customer(m.id);
  assert.equal(page.account?.lastResetLink?.state, "used");
  assert.ok(page.account?.passwordResetAt);

  // Yönetici hesabına ya da olmayan hesaba gönderilmez
  const admin = await prisma.user.create({ data: { email: "patron@example.com", role: "ADMIN", username: "patron" } });
  for (const id of [admin.id, "olmayan-kimlik"]) {
    await assert.rejects(sendResetLinkToCustomer(id, "admin-1", origin), (e: unknown) => e instanceof AdminActionError && e.status === 404);
  }
  assert.equal(smtp.received.length, 1);
});
