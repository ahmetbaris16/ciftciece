/**
 * Ürün değerlendirmeleri: yalnız ürünü satın almış müşteri, sipariş TESLİM EDİLDİKTEN sonra yazar; yazınca hemen
 * yayınlanır.
 * - Üye: hesabına bağlı teslim edilmiş siparişten (misafir siparişi e-postayla üyeliğe bağlanmaz).
 * - Üye olmadan verilmiş sipariş: o siparişin sayfasından, sipariş numarasıyla (sipariş başına ürün başına tek).
 * Mağaza uygunsuz yorumu yayından kaldırır (kayıt silinmez); müşteri düzenlerse yeniden yayınlanır.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { POST as reviewsApi } from "@/app/api/reviews/route";
import {
  ReviewNeedsLoginError,
  ReviewNotAllowedError,
  getOrderReviewContext,
  getProductReviews,
  hideReview,
  reviewEligibility,
  submitOrderReview,
  submitReview,
} from "@/lib/repositories/product-review.repository";
import { createProduct, setupTestDb } from "./helpers/db";
import { jsonRequest } from "./helpers/http";
import { createTestOrder } from "./helpers/orders";

setupTestDb();

async function customer(email = "alici@example.test") {
  return prisma.user.create({ data: { email, name: "Ayşe Kaya", role: "CUSTOMER", passwordHash: "x" } });
}

const review = { rating: 5, title: "Çok taze", text: "Zeytinler çok taze geldi, paketleme de sağlamdı." };

const notAllowed = (eligibility: string) => (err: unknown) =>
  err instanceof ReviewNotAllowedError && err.eligibility === eligibility;

test("üye: satın almayan yazamaz; sipariş verildi/kargoda ise 'teslim edilince'; teslim edilince yazar ve hemen yayında", async () => {
  const user = await customer();
  const { order, variant } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  const productId = variant.productId;

  assert.equal(await reviewEligibility(productId, user.id), "not_purchased");
  await assert.rejects(submitReview({ productId, userId: user.id, ...review }), notAllowed("not_purchased"));

  // Sipariş hesaba bağlı; ödendi/hazırlanıyor ve kargoda iken henüz değil (yalnız teslimattan sonra)
  for (const status of ["PENDING", "PROCESSING", "SHIPPED"] as const) {
    await prisma.order.update({ where: { id: order.id }, data: { userId: user.id, status } });
    assert.equal(await reviewEligibility(productId, user.id), "awaiting_delivery", status);
    await assert.rejects(submitReview({ productId, userId: user.id, ...review }), notAllowed("awaiting_delivery"));
  }

  await prisma.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });
  assert.equal(await reviewEligibility(productId, user.id), "eligible");
  const { review: saved } = await submitReview({ productId, userId: user.id, ...review });
  assert.equal(saved.status, "APPROVED");
  assert.equal(saved.isVerifiedPurchase, true);

  const pub = await getProductReviews(productId);
  assert.equal(pub.summary.count, 1);
  assert.equal(pub.reviews[0].authorName, "Ayşe K.");
  assert.equal(pub.reviews[0].isVerifiedPurchase, true);

  // İşletmeye "yeni değerlendirme yayınlandı" bildirimi kuyrukta
  assert.equal(await prisma.outboxEvent.count({ where: { topic: "review.submitted", aggregateId: saved.id } }), 1);
});

test("üye hakkı: misafir siparişi üyeliğe bağlanmaz (sipariş sayfasından yazılır); iptal edilmiş sipariş hak vermez", async () => {
  const user = await customer("misafir@example.test");
  const guest = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  await prisma.order.update({ where: { id: guest.order.id }, data: { status: "DELIVERED", guestEmail: user.email } });
  assert.equal(await reviewEligibility(guest.variant.productId, user.id), "not_purchased");

  const cancelled = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  await prisma.order.update({ where: { id: cancelled.order.id }, data: { userId: user.id, status: "CANCELLED" } });
  assert.equal(await reviewEligibility(cancelled.variant.productId, user.id), "not_purchased");
});

test("üye olmadan verilmiş sipariş: teslim edilince sipariş sayfasından yazar; adı siparişten; düzenleme aynı kayıt", async () => {
  const { order, variant } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  const productId = variant.productId;
  const input = { reference: order.reference, productId, ...review };

  // Teslim edilmeden yazılamaz; bölüm "teslim edilmedi" der
  await prisma.order.update({ where: { id: order.id }, data: { status: "SHIPPED" } });
  await assert.rejects(submitOrderReview(input), notAllowed("awaiting_delivery"));
  assert.equal((await getOrderReviewContext(order.reference))?.delivered, false);

  await prisma.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });
  const ctx = await getOrderReviewContext(order.reference);
  assert.equal(ctx?.delivered, true);
  assert.equal(ctx?.userId, null);
  assert.deepEqual(ctx?.items.map((i) => [i.productId, i.review]), [[productId, null]]);

  const { review: saved } = await submitOrderReview(input);
  assert.equal(saved.status, "APPROVED");
  assert.equal(saved.isVerifiedPurchase, true);
  const row = await prisma.productReview.findUniqueOrThrow({ where: { id: saved.id } });
  assert.equal(row.userId, null);
  assert.equal(row.orderId, order.id);

  const pub = await getProductReviews(productId);
  assert.equal(pub.reviews[0].authorName, "Test M."); // siparişteki ad: "Test Müşteri"
  assert.equal(pub.reviews[0].isVerifiedPurchase, true);
  assert.equal(await prisma.outboxEvent.count({ where: { topic: "review.submitted", aggregateId: saved.id } }), 1);

  // Sayfada yazdığı görünür; yeniden gönderince aynı kayıt güncellenir (sipariş başına ürün başına tek)
  assert.equal((await getOrderReviewContext(order.reference))?.items[0].review?.id, saved.id);
  const again = await submitOrderReview({ ...input, rating: 4, text: "Bir hafta sonra da çok lezzetliydi." });
  assert.equal(again.review.id, saved.id);
  assert.equal((await getProductReviews(productId)).summary.count, 1);
  assert.equal((await getProductReviews(productId)).reviews[0].rating, 4);

  // Mağaza kaldırır, misafir düzenleyince yeniden yayında
  await hideReview(saved.id);
  assert.equal((await getProductReviews(productId)).summary.count, 0);
  assert.equal((await submitOrderReview(input)).review.status, "APPROVED");
});

test("sipariş sayfasından: siparişte olmayan ürün, bilinmeyen sipariş, iptal yazamaz; üyelikle verilmiş sipariş giriş ister", async () => {
  const { order, variant } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  await prisma.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });
  const other = await createProduct({ priceKurus: 10_000, stock: 5 });

  await assert.rejects(submitOrderReview({ reference: order.reference, productId: other.product.id, ...review }), notAllowed("not_purchased"));
  await assert.rejects(submitOrderReview({ reference: "olmayan-siparis-no", productId: variant.productId, ...review }), notAllowed("not_purchased"));

  const cancelled = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  await prisma.order.update({ where: { id: cancelled.order.id }, data: { status: "CANCELLED" } });
  await assert.rejects(
    submitOrderReview({ reference: cancelled.order.reference, productId: cancelled.variant.productId, ...review }),
    notAllowed("not_purchased")
  );

  // Üyelikle verilmiş sipariş: sipariş numarası yetmez (değerlendirme üyenin hesabına yazılır)
  const member = await customer("uye@example.test");
  const memberOrder = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  await prisma.order.update({ where: { id: memberOrder.order.id }, data: { status: "DELIVERED", userId: member.id } });
  await assert.rejects(
    submitOrderReview({ reference: memberOrder.order.reference, productId: memberOrder.variant.productId, ...review }),
    ReviewNeedsLoginError
  );
  // Üyenin hesabından yazdığı, kendi sipariş sayfasında görünür
  const { review: mine } = await submitReview({ productId: memberOrder.variant.productId, userId: member.id, ...review });
  const ctx = await getOrderReviewContext(memberOrder.order.reference);
  assert.equal(ctx?.userId, member.id);
  assert.equal(ctx?.items[0].review?.id, mine.id);
  assert.equal(await prisma.productReview.count({ where: { orderId: { not: null } } }), 0);
});

test("API: sipariş numarasıyla girişsiz gönderim; teslim edilmemişte 403, üyelik siparişinde 401", async () => {
  const { order, variant } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  const body = { productId: variant.productId, ...review, orderRef: order.reference };

  const early = await reviewsApi(jsonRequest("http://localhost/api/reviews", body));
  assert.equal(early.status, 403);
  assert.equal((await early.json()).eligibility, "awaiting_delivery");

  await prisma.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });
  const ok = await reviewsApi(jsonRequest("http://localhost/api/reviews", body));
  assert.equal(ok.status, 200);
  const data = await ok.json();
  assert.equal(data.review.status, "APPROVED");

  // Başka siteden gelen istek reddedilir
  const cross = await reviewsApi(
    jsonRequest("http://localhost/api/reviews", body, { origin: "https://baska-site.example", host: "localhost" })
  );
  assert.equal(cross.status, 403);

  const member = await customer("api-uye@example.test");
  const memberOrder = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  await prisma.order.update({ where: { id: memberOrder.order.id }, data: { status: "DELIVERED", userId: member.id } });
  const needsLogin = await reviewsApi(
    jsonRequest("http://localhost/api/reviews", { productId: memberOrder.variant.productId, ...review, orderRef: memberOrder.order.reference })
  );
  assert.equal(needsLogin.status, 401);
  assert.equal((await needsLogin.json()).needsLogin, true);
});

test("mağaza yayından kaldırır (kayıt durur); üye düzenleyince yeniden yayında", async () => {
  const user = await customer("duzenleyen@example.test");
  const { order, variant } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  await prisma.order.update({ where: { id: order.id }, data: { userId: user.id, status: "DELIVERED" } });
  const { review: saved } = await submitReview({ productId: variant.productId, userId: user.id, ...review });

  const hidden = await hideReview(saved.id);
  assert.ok(hidden?.productSlug);
  assert.equal((await getProductReviews(variant.productId)).summary.count, 0);
  const row = await prisma.productReview.findUniqueOrThrow({ where: { id: saved.id } });
  assert.equal(row.status, "REJECTED");
  assert.equal(await hideReview("olmayan-yorum"), null);

  const again = await submitReview({ productId: variant.productId, userId: user.id, ...review, text: "Düzelttim: ürün gerçekten güzel." });
  assert.equal(again.review.id, saved.id); // müşteri başına ürün başına tek değerlendirme
  assert.equal(again.review.status, "APPROVED");
  assert.equal((await getProductReviews(variant.productId)).summary.count, 1);
});
