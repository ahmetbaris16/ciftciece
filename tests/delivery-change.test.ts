/**
 * Teslimat bilgisi değişikliği: müşteri sipariş sayfasından (siparişi veren tarayıcı ya da e-postadaki bağlantı),
 * yönetici panelden. Kargoya verilene kadar; eski adres yalnız yöneticiye görünen geçmişte; müşteriye ve
 * işletmeye e-posta; kargolama ekrandaki adres eskidiyse reddedilir.
 */

import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { POST as checkout } from "@/app/api/checkout/route";
import { POST as changeAddress } from "@/app/api/orders/[ref]/address/route";
import { POST as requestLink } from "@/app/api/orders/[ref]/address-link/route";
import { GET as openLink } from "@/app/(shop)/siparis/[ref]/adres/route";
import { processOutbox } from "@/lib/notifications/dispatcher";
import { saveBusinessInfo } from "@/lib/business/business.repository";
import { parseBusinessInfo } from "@/lib/business/info";
import { OrderTransitionError, updateOrderStatus } from "@/lib/repositories/order.repository";
import { cancelByCustomer, changeShippingAddress, setInvoice, shipOrder } from "@/lib/orders/lifecycle";
import {
  ORDER_ACCESS_COOKIE,
  addOrderAccess,
  hasOrderAccess,
  orderLinkToken,
  verifyOrderLinkToken,
} from "@/lib/orders/access";
import { createProduct, enableBankTransfer, setupTestDb } from "./helpers/db";
import { checkoutBody, jsonRequest } from "./helpers/http";
import { createPaidTransferOrder, createTestOrder } from "./helpers/orders";

setupTestDb();

beforeEach(async () => {
  await saveBusinessInfo({
    ...parseBusinessInfo(null),
    email: "bilgi@ornek-magaza.test",
    notificationEmail: "siparis-bildirim@ornek-magaza.test",
  });
  await enableBankTransfer();
});

const NEW = {
  firstName: "Ahmet",
  lastName: "Yılmaz",
  phone: "+905551112233",
  city: "Kırşehir",
  district: "Kaman",
  address: "Cumhuriyet Mahallesi Atatürk Caddesi No 12 Daire 3",
  postalCode: "40300",
};
// API'ye müşterinin yazdığı biçimde
const NEW_INPUT = { ...NEW, phone: "0555 111 22 33" };

const isTransition = (re: RegExp, status?: number) => (err: unknown) =>
  err instanceof OrderTransitionError && re.test(err.message) && (status === undefined || err.status === status);

const addressOf = async (orderId: string) =>
  (await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { shippingAddress: true } })).shippingAddress as Record<string, unknown>;

test("müşteri değiştirir: adres güncellenir, önceki adres yalnız yöneticinin gördüğü kayıtta; müşteriye ve işletmeye e-posta", async () => {
  const { order } = await createPaidTransferOrder();
  // Kargo firması ve ödeme şekli (sipariş anı) korunmalı
  await prisma.order.update({
    where: { id: order.id },
    data: { shippingAddress: { ...(await addressOf(order.id)), carrier: { id: "yurtici", name: "Yurtiçi Kargo" }, shippingMode: "prepaid" } },
  });
  await processOutbox(); // sipariş ve ödeme e-postaları ayrı kalsın

  assert.deepEqual(await changeShippingAddress(order.id, NEW, { type: "CUSTOMER" }), { changed: true });

  const a = await addressOf(order.id);
  for (const [k, v] of Object.entries(NEW)) assert.equal(a[k], v, k);
  assert.deepEqual(a.carrier, { id: "yurtici", name: "Yurtiçi Kargo" });
  assert.equal(a.shippingMode, "prepaid");

  const ev = await prisma.orderEvent.findMany({ where: { orderId: order.id, type: "ADDRESS" }, orderBy: { createdAt: "asc" } });
  assert.equal(ev.length, 2);
  const internal = ev.find((e) => !e.visibleToCustomer)!;
  const visible = ev.find((e) => e.visibleToCustomer)!;
  assert.equal(internal.actorType, "CUSTOMER");
  assert.match(internal.message, /Önceki: Test Müşteri, Test Mahallesi Deneme Sokak No 1, Orhangazi \/ Bursa/);
  assert.match(internal.message, /Yeni: Ahmet Yılmaz, Cumhuriyet Mahallesi .* Kaman \/ Kırşehir 40300/);
  assert.equal(visible.message, "Teslimat bilgileriniz güncellendi.");

  // Bildirim olayında kişisel veri yok
  const outbox = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: order.id, topic: "order.address_changed" } });
  assert.deepEqual(Object.keys(outbox.payload as object).sort(), ["by", "eventId", "orderId"]);

  await processOutbox();
  const mails = await prisma.emailMessage.findMany({ where: { orderId: order.id, kind: { in: ["ADDRESS_CHANGED", "STORE_ADDRESS_CHANGED"] } } });
  const customer = mails.find((m) => m.kind === "ADDRESS_CHANGED")!;
  const store = mails.find((m) => m.kind === "STORE_ADDRESS_CHANGED")!;
  assert.equal(customer.toAddress, "musteri@example.com");
  assert.match(customer.subject, /Teslimat bilgileriniz güncellendi/);
  assert.ok(customer.text.includes("Kaman / Kırşehir 40300"), "müşteri e-postasında yeni adres");
  assert.ok(customer.text.includes("siz yapmadıysanız"), "başkası değiştirdiyse uyarı");
  assert.equal(store.toAddress, "siparis-bildirim@ornek-magaza.test");
  assert.ok(store.text.includes("Önceki: Test Müşteri"), "işletme e-postasında önceki adres");
  assert.ok(store.text.includes("yeniden yazdırın"), "fişi yeniden yazdır");
});

test("yönetici değiştirir: müşteriye bilgi gider, işletmeye gitmez; aynı bilgiler kayıt/e-posta üretmez", async () => {
  const { order } = await createPaidTransferOrder();
  await processOutbox();
  assert.deepEqual(await changeShippingAddress(order.id, NEW, { type: "ADMIN", id: "admin-1" }), { changed: true });
  assert.deepEqual(await changeShippingAddress(order.id, NEW, { type: "ADMIN", id: "admin-1" }), { changed: false });
  assert.equal(await prisma.orderEvent.count({ where: { orderId: order.id, type: "ADDRESS" } }), 2);
  await processOutbox();
  const kinds = (await prisma.emailMessage.findMany({ where: { orderId: order.id } })).map((m) => m.kind);
  assert.ok(kinds.includes("ADDRESS_CHANGED"));
  assert.ok(!kinds.includes("STORE_ADDRESS_CHANGED"));
});

test("kargoya verilmiş ve iptal edilmiş siparişte değiştirilemez", async () => {
  const shipped = await createPaidTransferOrder();
  await shipOrder(shipped.order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "123456789012" }, "admin-1");
  await assert.rejects(changeShippingAddress(shipped.order.id, NEW, { type: "CUSTOMER" }), isTransition(/kargoya verildi/));
  await updateOrderStatus(shipped.order.id, "DELIVERED", "admin-1");
  await assert.rejects(changeShippingAddress(shipped.order.id, NEW, { type: "ADMIN", id: "a" }), isTransition(/kargoya verildi/));

  const pending = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 60 });
  await cancelByCustomer(pending.order.reference);
  await assert.rejects(changeShippingAddress(pending.order.id, NEW, { type: "CUSTOMER" }), isTransition(/kapandı/));
});

test("fatura düzenlenmişse ve fatura adresi teslimatla aynıysa önceki adres faturaya sabitlenir", async () => {
  const { order } = await createPaidTransferOrder();
  await prisma.order.update({ where: { id: order.id }, data: { billingInfo: { type: "INDIVIDUAL", name: "Test Müşteri", sameAsShipping: true } } });
  await setInvoice(order.id, { invoiceNumber: "GIB2026000000123", issuedAt: new Date() }, "admin-1");
  await changeShippingAddress(order.id, NEW, { type: "CUSTOMER" });
  const billing = (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).billingInfo as Record<string, unknown>;
  assert.equal(billing.sameAsShipping, false);
  assert.equal(billing.address, "Test Mahallesi Deneme Sokak No 1");
  assert.equal(billing.city, "Bursa");
  assert.equal(billing.name, "Test Müşteri");
});

test("kargolama: ekrandaki adres sonra değiştiyse 409; güncel zamanla kargolanır", async () => {
  const { order } = await createPaidTransferOrder();
  const seen = 0; // yönetici sayfayı açtığında değişiklik yoktu
  await changeShippingAddress(order.id, NEW, { type: "CUSTOMER" });
  await assert.rejects(
    shipOrder(order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "123456789012", addressSeenAt: seen }, "admin-1"),
    isTransition(/bu sayfa açıldıktan sonra değişti \(müşteri/, 409)
  );
  assert.equal(await prisma.shipment.count(), 0);
  const last = await prisma.orderEvent.findFirstOrThrow({ where: { orderId: order.id, type: "ADDRESS", visibleToCustomer: false } });
  await shipOrder(order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "123456789012", addressSeenAt: last.createdAt.getTime() }, "admin-1");
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, "SHIPPED");
});

// ── API: izin (sipariş numarası tek başına yetmez) ──────────────────────

async function placeOrder(cookie?: string) {
  const { variant } = await createProduct({ priceKurus: 10_000, stock: 5 });
  const res = await checkout(
    jsonRequest(
      "http://localhost/api/checkout",
      checkoutBody([{ variantId: variant.id, quantity: 1 }], { paymentMethod: "BANK_TRANSFER" }),
      cookie ? { cookie } : {}
    )
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  return { reference: body.order.reference as string, orderId: body.orderId as string, cookie: res.cookies.get(ORDER_ACCESS_COOKIE)?.value ?? "" };
}

const callChange = (ref: string, body: unknown, cookie?: string) =>
  changeAddress(
    jsonRequest(`http://localhost/api/orders/${ref}/address`, body, cookie ? { cookie: `${ORDER_ACCESS_COOKIE}=${cookie}` } : {}),
    { params: Promise.resolve({ ref }) }
  );

test("API: çerezsiz istek reddedilir (needsVerification); siparişi veren tarayıcının çereziyle değişir; başka siparişin çerezi işe yaramaz", async () => {
  const first = await placeOrder();
  assert.ok(first.cookie, "ödeme adımı izin çerezi bıraktı");
  assert.ok(hasOrderAccess(first.cookie, first.reference));
  // İkinci sipariş aynı tarayıcıda: çerez iki siparişi de tutar
  const second = await placeOrder(`${ORDER_ACCESS_COOKIE}=${first.cookie}`);
  assert.ok(hasOrderAccess(second.cookie, first.reference) && hasOrderAccess(second.cookie, second.reference));

  const anon = await callChange(first.reference, NEW_INPUT);
  assert.equal(anon.status, 403);
  assert.equal((await anon.json()).needsVerification, true);

  const bad = await callChange(first.reference, { ...NEW_INPUT, phone: "12" }, first.cookie);
  assert.equal(bad.status, 400);
  assert.ok((await bad.json()).fieldErrors.phone);

  const ok = await callChange(first.reference, NEW_INPUT, first.cookie);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, changed: true });
  assert.equal((await addressOf(first.orderId)).phone, "+905551112233");

  // Başka bir siparişin çerezi bu siparişte geçmez
  const other = await createPaidTransferOrder();
  const foreign = await callChange(other.order.reference, NEW_INPUT, addOrderAccess(null, first.reference));
  assert.equal(foreign.status, 403);
});

test("API: e-postaya bağlantı → bağlantı çerez verir ve formu açtırır; bozuk ya da süresi geçmiş bağlantı reddedilir", async () => {
  const { reference, orderId } = await placeOrder();
  const res = await requestLink(new NextRequest(`http://localhost/api/orders/${reference}/address-link`, { method: "POST" }), {
    params: Promise.resolve({ ref: reference }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).sentTo, "ay***@example.com");
  const mail = await prisma.emailMessage.findFirstOrThrow({ where: { orderId, kind: "ADDRESS_LINK" } });
  assert.equal(mail.toAddress, "ayse@example.com");
  assert.ok(mail.expiresAt, "bağlantı e-postası süresi geçince gönderilmez");
  const link = new URL(/https?:\/\/[^\s"]+\/adres\?t=[^\s"&]+/.exec(mail.text)?.[0] ?? "http://x/");
  assert.equal(link.pathname, `/siparis/${reference}/adres`);

  const opened = await openLink(new NextRequest(link.toString().replace(link.origin, "http://localhost")), { params: Promise.resolve({ ref: reference }) });
  assert.equal(opened.status, 303);
  assert.match(opened.headers.get("location") ?? "", new RegExp(`/siparis/${reference}\\?adres=1#teslimat$`));
  const granted = opened.cookies.get(ORDER_ACCESS_COOKIE)?.value ?? "";
  assert.ok(hasOrderAccess(granted, reference));
  assert.equal((await callChange(reference, NEW_INPUT, granted)).status, 200);

  const t = link.searchParams.get("t")!;
  const tampered = await openLink(new NextRequest(`http://localhost/siparis/${reference}/adres?t=${t.slice(0, -2)}xx`), {
    params: Promise.resolve({ ref: reference }),
  });
  assert.match(tampered.headers.get("location") ?? "", /\?adres=gecersiz#teslimat$/);
  assert.equal(tampered.cookies.get(ORDER_ACCESS_COOKIE), undefined);
  // Başka siparişin bağlantısı bu siparişte geçmez; süresi geçmiş bağlantı geçmez
  assert.equal(verifyOrderLinkToken("baska-siparis", t), false);
  assert.equal(verifyOrderLinkToken(reference, orderLinkToken(reference, Date.now() - 25 * 3_600_000)), false);
  assert.equal(verifyOrderLinkToken(reference, orderLinkToken(reference, Date.now() - 23 * 3_600_000)), true);
});

test("API: kargoya verilmiş siparişte bağlantı istenemez", async () => {
  const { order } = await createPaidTransferOrder();
  await shipOrder(order.id, { carrier: "Yurtiçi Kargo", trackingNumber: "123456789012" }, "admin-1");
  const res = await requestLink(new NextRequest(`http://localhost/api/orders/${order.reference}/address-link`, { method: "POST" }), {
    params: Promise.resolve({ ref: order.reference }),
  });
  assert.equal(res.status, 409);
  assert.equal(await prisma.emailMessage.count({ where: { kind: "ADDRESS_LINK" } }), 0);
});
