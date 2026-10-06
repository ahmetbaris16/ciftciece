/**
 * Ürün değerlendirmeleri: yalnız ürünü satın almış (hesabına bağlı, kargoya verilmiş ya da teslim edilmiş siparişi
 * olan) üye yazar; yazınca hemen yayınlanır. Misafir siparişi sayılmaz. Mağaza uygunsuz yorumu yayından kaldırır
 * (kayıt silinmez); müşteri düzenlerse yeniden yayınlanır.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import {
  ReviewNotAllowedError,
  getProductReviews,
  hideReview,
  reviewEligibility,
  submitReview,
} from "@/lib/repositories/product-review.repository";
import { setupTestDb } from "./helpers/db";
import { createTestOrder } from "./helpers/orders";

setupTestDb();

async function customer(email = "alici@example.test") {
  return prisma.user.create({ data: { email, name: "Ayşe Kaya", role: "CUSTOMER", passwordHash: "x" } });
}

const review = { rating: 5, title: "Çok taze", text: "Zeytinler çok taze geldi, paketleme de sağlamdı." };

test("satın almayan yazamaz; ödendi ama kargolanmadıysa 'kargoya verilince'; kargolanınca yazar ve hemen yayında", async () => {
  const user = await customer();
  const { order, variant } = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  const productId = variant.productId;

  assert.equal(await reviewEligibility(productId, user.id), "not_purchased");
  await assert.rejects(
    submitReview({ productId, userId: user.id, ...review }),
    (err: unknown) => err instanceof ReviewNotAllowedError && err.eligibility === "not_purchased"
  );

  // Sipariş hesaba bağlı ve ödendi/hazırlanıyor: henüz değil
  await prisma.order.update({ where: { id: order.id }, data: { userId: user.id, status: "PROCESSING" } });
  assert.equal(await reviewEligibility(productId, user.id), "awaiting_shipment");
  await assert.rejects(
    submitReview({ productId, userId: user.id, ...review }),
    (err: unknown) => err instanceof ReviewNotAllowedError && err.eligibility === "awaiting_shipment"
  );

  await prisma.order.update({ where: { id: order.id }, data: { status: "SHIPPED" } });
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

test("misafir siparişi (hesaba bağlı değil) ve iptal edilmiş sipariş hak vermez", async () => {
  const user = await customer("misafir@example.test");
  const guest = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  await prisma.order.update({ where: { id: guest.order.id }, data: { status: "DELIVERED", guestEmail: user.email } });
  assert.equal(await reviewEligibility(guest.variant.productId, user.id), "not_purchased");

  const cancelled = await createTestOrder({ method: "BANK_TRANSFER", dueInMinutes: 48 * 60 });
  await prisma.order.update({ where: { id: cancelled.order.id }, data: { userId: user.id, status: "CANCELLED" } });
  assert.equal(await reviewEligibility(cancelled.variant.productId, user.id), "not_purchased");
});

test("mağaza yayından kaldırır (kayıt durur); müşteri düzenleyince yeniden yayında", async () => {
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
