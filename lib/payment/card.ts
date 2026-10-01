/**
 * Kartla ödeme akışı (iyzico Ortak Ödeme Formu).
 *
 *  startCardPayment   Siparişe yeni bir ödeme denemesi açar (her token ayrı deneme; eski satır ezilmez).
 *                     Önce açık denemeleri sağlayıcıya sorar: biri ödenmişse yeni form açılmaz.
 *  handleCardCallback Tarayıcı dönüşü: yalnız tetikleyici. Deneme token'dan bulunur, sonuç sunucudan
 *                     sorgulanır (verify.ts); müşteriye gidilecek adres döner.
 *
 * Dış HTTP çağrıları hiçbir DB transaction'ı içinde yapılmaz.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getPaymentProvider } from "./provider";
import { getPaymentSettings } from "./settings.repository";
import { recordPaymentEvent } from "./events";
import { verifyAttempt, type VerifyOutcome } from "./verify";
import { cardPaymentDueAt } from "./reservation";

export type StartCardPaymentResult =
  | { ok: true; redirectUrl?: string; checkoutFormHtml?: string; form?: { action: string; fields: Record<string, string> } }
  | {
      ok: false;
      status: number;
      code: "NOT_FOUND" | "NOT_CARD" | "NOT_PENDING" | "EXPIRED" | "ALREADY_PAID" | "REVIEW" | "PROVIDER_ERROR";
      error: string;
      reference?: string;
    };

const PAID_OUTCOMES: VerifyOutcome[] = ["paid", "already_paid", "late_reopened"];
const REVIEW_OUTCOMES: VerifyOutcome[] = ["mismatch", "duplicate", "late_no_stock", "closed_order"];

export async function startCardPayment(
  orderId: string,
  ctx: { appUrl: string; buyerIp?: string }
): Promise<StartCardPaymentResult> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) {
    return { ok: false, status: 404, code: "NOT_FOUND", error: "Sipariş bulunamadı. Lütfen tekrar sipariş verin." };
  }
  if (order.paymentMethod !== "CARD") {
    return { ok: false, status: 409, code: "NOT_CARD", error: "Bu sipariş kartla ödenmiyor." };
  }
  if (order.needsAttention) {
    return {
      ok: false,
      status: 409,
      code: "REVIEW",
      reference: order.reference,
      error: "Bu siparişin ödemesi kontrol ediliyor. Tekrar ödeme yapmayın; sizinle iletişime geçeceğiz.",
    };
  }
  if (order.status === "PENDING" && order.paymentDueAt && order.paymentDueAt.getTime() <= Date.now()) {
    // Rezervasyon bitti: yeni ödeme formu açılmaz (sipariş birazdan otomatik iptal edilir)
    return {
      ok: false,
      status: 409,
      code: "EXPIRED",
      reference: order.reference,
      error: "Bu siparişin ödeme süresi doldu. Lütfen siparişi yeniden verin.",
    };
  }
  if (order.status !== "PENDING") {
    const paid = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status);
    return {
      ok: false,
      status: 409,
      code: paid ? "ALREADY_PAID" : "NOT_PENDING",
      reference: order.reference,
      error: paid ? "Bu siparişin ödemesi zaten alınmış." : "Bu sipariş kapanmış. Lütfen yeniden sipariş verin.",
    };
  }

  const provider = getPaymentProvider();

  // Açık denemeler: müşteri başka sekmede/önceki formda ödemiş olabilir → yeni form açmadan önce sor
  const open = await prisma.paymentAttempt.findMany({
    where: { orderId: order.id, status: "INITIATED", provider: provider.name, providerToken: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { id: true },
  });
  for (const attempt of open) {
    const r = await verifyAttempt(attempt.id, { source: "QUERY" });
    if (PAID_OUTCOMES.includes(r.outcome)) {
      return { ok: false, status: 409, code: "ALREADY_PAID", reference: order.reference, error: "Bu siparişin ödemesi zaten alınmış." };
    }
    if (REVIEW_OUTCOMES.includes(r.outcome)) {
      return {
        ok: false,
        status: 409,
        code: "REVIEW",
        reference: order.reference,
        error: "Bu siparişin ödemesi kontrol ediliyor. Tekrar ödeme yapmayın; sizinle iletişime geçeceğiz.",
      };
    }
  }

  const settings = await getPaymentSettings();
  const attempt = await prisma.paymentAttempt.create({
    data: {
      orderId: order.id,
      provider: provider.name,
      method: "CARD",
      amountKurus: order.totalKurus,
      currency: "TRY",
    },
  });

  const address = order.shippingAddress as Record<string, string> | null;
  const result = await provider.createPayment({
    orderId: order.id,
    attemptId: attempt.id,
    orderReference: order.reference,
    amountKurus: order.totalKurus,
    currency: "TRY",
    buyer: {
      email: order.guestEmail ?? "",
      firstName: order.guestName?.split(" ")[0] ?? "",
      lastName: order.guestName?.split(" ").slice(1).join(" ") ?? "",
      phone: order.guestPhone ?? "",
      city: address?.city ?? "",
      address: address?.address ?? "",
    },
    // Sağlayıcıda kalemlerin toplamı sipariş tutarına eşit olmalı → kargo da kalem
    items: [
      // Kalem tutarı = birim × adet − kalem indirimi (iyzico'da adet alanı yok)
      ...order.items.map((i) => ({
        name: `${i.snapshotName} - ${i.snapshotVariant} × ${i.quantity}`,
        priceKurus: i.snapshotPrice * i.quantity - i.discountKurus,
        quantity: 1,
      })),
      ...(order.shippingKurus > 0 ? [{ name: "Kargo", priceKurus: order.shippingKurus, quantity: 1 }] : []),
      ...(order.paymentFeeKurus > 0 ? [{ name: "Ödeme hizmet bedeli", priceKurus: order.paymentFeeKurus, quantity: 1 }] : []),
    ],
    callbackUrl: `${ctx.appUrl}${provider.callbackPath ?? "/api/payment/verify"}?attempt=${encodeURIComponent(attempt.id)}`,
    buyerId: order.userId ?? undefined,
    buyerIp: ctx.buyerIp,
    maxInstallment: settings.card.maxInstallment,
  });

  if (!result.success || !result.providerRef) {
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: "FAILED", conversationId: attempt.id, failureReason: `başlatılamadı: ${result.error ?? "token yok"}`.slice(0, 1000) },
    });
    // Sağlayıcının ham hata metni loglanır, müşteriye gösterilmez
    console.error("[payment/create] provider error:", result.error);
    return { ok: false, status: 502, code: "PROVIDER_ERROR", error: "Ödeme başlatılamadı. Lütfen tekrar deneyin." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { providerToken: result.providerRef, tokenExpiresAt: result.tokenExpiresAt ?? null, conversationId: attempt.id },
    });
    // Rezervasyon, en son açılan formun token ömrünü geçmez ve siparişten itibaren 30 dk'yı aşmaz
    // (lib/payment/reservation.ts). Dokümandaki token ömrü 30 dk olduğu için normalde değişiklik olmaz.
    if (result.tokenExpiresAt) {
      const cap = cardPaymentDueAt(order.createdAt).getTime();
      const due = new Date(Math.min(cap, result.tokenExpiresAt.getTime()));
      const current = order.paymentDueAt?.getTime() ?? cap;
      // 1 sn tolerans: checkout'taki süre ile createdAt arasındaki milisaniye farkı değişiklik sayılmaz
      if (Math.abs(due.getTime() - current) > 1000) {
        const { count } = await tx.order.updateMany({
          where: { id: order.id, status: "PENDING" },
          data: { paymentDueAt: due },
        });
        if (count === 1 && due.getTime() < cap - 1000) {
          console.warn(`[payment/create] iyzico token ömrü rezervasyondan kısa; son ödeme ${due.toISOString()} (${order.reference})`);
          await recordPaymentEvent(tx, {
            source: "SYSTEM",
            eventType: "reservation.shortened_to_token",
            provider: provider.name,
            orderId: order.id,
            attemptId: attempt.id,
            payload: { tokenExpiresAt: result.tokenExpiresAt!.toISOString(), paymentDueAt: due.toISOString() },
          });
        }
      }
    }
  });

  return { ok: true, redirectUrl: result.redirectUrl, checkoutFormHtml: result.checkoutFormHtml, form: result.form };
}

/**
 * Eski koddan (bu sürümden önce) açılmış ödeme formunun dönüşü: deneme kaydı yoktur.
 * Yalnız eski kayıttaki (payments.providerRef) token'la birebir aynıysa ve siparişin hiç denemesi
 * yoksa token deneme olarak kaydedilir; doğrulama yine sağlayıcıdan yapılır.
 */
async function adoptLegacyAttempt(providerName: string, token: string, orderIdHint: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderIdHint },
    select: { id: true, paymentMethod: true, totalKurus: true, payment: { select: { provider: true, providerRef: true } } },
  });
  if (!order || order.paymentMethod !== "CARD") return null;
  if (order.payment?.provider !== providerName || order.payment.providerRef !== token) return null;
  if (await prisma.paymentAttempt.count({ where: { orderId: order.id } })) return null;
  try {
    return await prisma.paymentAttempt.create({
      data: {
        orderId: order.id,
        provider: providerName,
        method: "CARD",
        amountKurus: order.totalKurus,
        currency: "TRY",
        // Eski kod conversationId olarak sipariş id'sini gönderiyordu
        conversationId: order.id,
        providerToken: token,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return prisma.paymentAttempt.findUnique({
        where: { provider_providerToken: { provider: providerName, providerToken: token } },
      });
    }
    throw err;
  }
}

export interface CallbackInput {
  token: string;
  /** callbackUrl'deki deneme kimliği — yalnız ipucu, token'daki deneme esastır */
  attemptHint?: string | null;
  /** Eski callbackUrl'deki sipariş kimliği (?orderId=) */
  orderIdHint?: string | null;
  /** Dönüşle gelen, kayda yazılacak ek bilgi (kart verisi içermez; ör. Akbank yanıt kodu, imza geçerli mi) */
  meta?: Record<string, unknown>;
}

/** Müşterinin yönlendirileceği yol ("/siparis/…" ya da "/odeme?error=…") */
export async function handleCardCallback(input: CallbackInput): Promise<string> {
  if (!input.token) return "/odeme?error=payment_error";

  let providerName: string;
  try {
    providerName = getPaymentProvider().name;
  } catch (err) {
    console.error("[payment/verify] sağlayıcı hazır değil:", (err as Error).message);
    return "/odeme?error=payment_error";
  }

  let attempt = await prisma.paymentAttempt.findUnique({
    where: { provider_providerToken: { provider: providerName, providerToken: input.token } },
  });
  if (!attempt && input.orderIdHint) {
    attempt = await adoptLegacyAttempt(providerName, input.token, input.orderIdHint);
  }

  await recordPaymentEvent(prisma, {
    source: "CALLBACK",
    eventType: "callback.received",
    provider: providerName,
    orderId: attempt?.orderId ?? null,
    attemptId: attempt?.id ?? null,
    outcome: attempt ? null : "unknown_token",
    payload: {
      attemptHint: input.attemptHint ?? null,
      hintMatches: input.attemptHint ? input.attemptHint === attempt?.id : null,
      ...(input.meta ?? {}),
    },
  });

  if (!attempt) {
    console.warn("[payment/verify] token bir ödeme denemesiyle eşleşmedi");
    return "/odeme?error=payment_not_found";
  }
  if (input.attemptHint && input.attemptHint !== attempt.id) {
    console.warn(`[payment/verify] callback denemesi (${input.attemptHint}) token'ın denemesiyle (${attempt.id}) aynı değil; token esas alındı`);
  }

  let result;
  try {
    result = await verifyAttempt(attempt.id, { source: "CALLBACK" });
  } catch (err) {
    // Doğrulama/kayıt hatası: ödeme olmuş olabilir → müşteri tekrar ödemeye yönlendirilmez
    console.error("[payment/verify] doğrulama hatası:", attempt.id, err);
    const order = await prisma.order.findUnique({ where: { id: attempt.orderId }, select: { reference: true } }).catch(() => null);
    return order ? `/siparis/${order.reference}?odeme=dogrulaniyor` : "/odeme?error=payment_unverified";
  }
  const orderPath = `/siparis/${result.orderReference}`;
  switch (result.outcome) {
    case "failed":
      return "/odeme?error=payment_failed";
    case "pending":
    case "unverified":
      // Sonuç bilinmiyor: müşteri tekrar ödemesin; sipariş sayfası "doğrulanıyor" der
      return `${orderPath}?odeme=dogrulaniyor`;
    default:
      return orderPath;
  }
}
