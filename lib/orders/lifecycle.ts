/**
 * Sipariş sonrası işlemler: kargolama (takip numarasıyla), iade kaydı, müşteri talepleri (iptal/cayma),
 * müşterinin ödenmemiş siparişi iptali, admin notu, fatura numarası.
 *
 * Her işlem tek veritabanı işlemidir: sipariş satırı kilitlenir (SELECT … FOR UPDATE), iş kaydı + sipariş
 * geçmişi + bildirim olayı birlikte yazılır. Para hareketi yapılmaz: iade bankadan/havaleyle yapılır, burada
 * kaydı tutulur (karar 9 — muhafazakâr seçenek).
 */

import { Prisma, type CustomerRequestType, type OrderStatus, type RefundMethod } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { writeOutbox } from "@/lib/outbox";
import { formatPrice } from "@/types";
import type { PaymentMethod } from "@/types";
import { recordOrderEvent } from "./events";
import {
  changeStatusInTx,
  FULLY_REFUNDED_MESSAGE,
  hasOpenCancelRequest,
  isFullyRefunded,
  OPEN_CANCEL_REQUEST_MESSAGE,
  OrderTransitionError,
  paidAmountKurus,
  refundedAmountKurus,
  type OrderRow,
} from "@/lib/repositories/order.repository";
import { isValidTrackingNumber, normalizeTrackingNumber, trackingLinkFor } from "@/lib/shipping/carriers";

type Tx = Prisma.TransactionClient;

async function lockOrder(tx: Tx, orderId: string): Promise<OrderRow & { needsAttention: boolean }> {
  const rows = await tx.$queryRaw<
    Array<{ id: string; reference: string; status: OrderStatus; paymentMethod: PaymentMethod; totalKurus: number; needsAttention: number | boolean }>
  >`SELECT \`id\`, \`reference\`, \`status\`, \`paymentMethod\`, \`totalKurus\`, \`needsAttention\`
    FROM \`orders\` WHERE \`id\` = ${orderId} FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new OrderTransitionError("Sipariş bulunamadı.", 404);
  return { ...row, totalKurus: Number(row.totalKurus), needsAttention: Boolean(row.needsAttention) };
}

const REFUND_METHOD_TR: Record<RefundMethod, string> = {
  CARD_PROVIDER: "karta iade",
  BANK_TRANSFER: "banka hesabına iade",
  CASH: "elden iade",
  OTHER: "iade",
};

// ── Kargolama ────────────────────────────────────────────────────────────

export interface ShipInput {
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string | null;
}

/**
 * Siparişi kargoya verir (R-22: takip numarası zorunlu). Ödenmiş ya da hazırlanan sipariş SHIPPED olur;
 * zaten kargodaysa ek gönderi (ek koli) kaydedilir. Ödeme incelemesindeki (R-12), parası tamamen iade edilmiş ya
 * da müşterinin iptal isteği karar bekleyen sipariş kargolanamaz.
 */
export async function shipOrder(orderId: string, input: ShipInput, actorId: string | null) {
  const trackingNumber = normalizeTrackingNumber(input.trackingNumber);
  if (!isValidTrackingNumber(trackingNumber)) {
    throw new OrderTransitionError("Takip numarası geçersiz (6–40 harf/rakam).", 400);
  }
  const carrier = input.carrier.trim().slice(0, 60) || "Yurtiçi Kargo";
  const explicitUrl = input.trackingUrl?.trim() || null;
  if (explicitUrl && !/^https:\/\//.test(explicitUrl)) {
    throw new OrderTransitionError("Takip bağlantısı https:// ile başlamalı.", 400);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, orderId);
      if (order.needsAttention) {
        throw new OrderTransitionError(
          "Bu siparişin ödemesi kontrol ediliyor (Dikkat). Ödeme durumu netleşmeden kargolamayın."
        );
      }
      const shippable: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED"];
      if (!shippable.includes(order.status)) {
        throw new OrderTransitionError(
          order.status === "PENDING"
            ? "Ödemesi alınmamış sipariş kargolanamaz."
            : order.status === "CANCELLED" || order.status === "REFUNDED"
              ? "Bu sipariş kapandı (iptal/iade); kargolanamaz. Sayfayı yenileyin."
              : "Bu durumdaki sipariş kargolanamaz."
        );
      }
      if (await isFullyRefunded(tx, orderId)) throw new OrderTransitionError(FULLY_REFUNDED_MESSAGE);
      if (order.status !== "SHIPPED" && (await hasOpenCancelRequest(tx, orderId))) {
        throw new OrderTransitionError(OPEN_CANCEL_REQUEST_MESSAGE);
      }

      const shipment = await tx.shipment.create({
        data: {
          orderId,
          carrier,
          trackingNumber,
          trackingUrl: explicitUrl,
          createdById: actorId,
        },
      });

      if (order.status !== "SHIPPED") {
        const { count } = await tx.order.updateMany({
          where: { id: orderId, status: order.status },
          data: { status: "SHIPPED" },
        });
        if (count !== 1) throw new OrderTransitionError("Sipariş durumu bu sırada değişti, sayfayı yenileyin.");
        await recordOrderEvent(tx, {
          orderId,
          type: "STATUS",
          actorType: "ADMIN",
          actorId,
          fromStatus: order.status,
          toStatus: "SHIPPED",
          visibleToCustomer: false,
          message: "Kargoya verildi.",
        });
      }
      await recordOrderEvent(tx, {
        orderId,
        type: "SHIPMENT",
        actorType: "ADMIN",
        actorId,
        visibleToCustomer: true,
        message: `${carrier} ile kargoya verildi. Takip no: ${trackingNumber}`,
      });
      await writeOutbox(tx, {
        topic: "order.shipped",
        aggregateType: "order",
        aggregateId: orderId,
        dedupeKey: `order.shipped:${shipment.id}`,
        payload: { orderId, shipmentId: shipment.id, additional: order.status === "SHIPPED" },
      });
      return { ...shipment, trackingLink: trackingLinkFor(carrier, trackingNumber, explicitUrl) };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new OrderTransitionError("Bu takip numarası başka bir gönderide kayıtlı.", 409);
    }
    throw err;
  }
}

// ── İade kaydı ───────────────────────────────────────────────────────────

export interface RefundInput {
  amountKurus: number;
  method: RefundMethod;
  reference?: string | null;
  reason: string;
  /** Kargolanmış siparişin tam iadesinde geri gelen ürünler stoğa eklensin mi */
  restock?: boolean;
}

/**
 * İade kaydı. Alınan ödemenin tamamı iade edilince açık sipariş kendiliğinden kapanır: kargolanmamış → İptal
 * edildi (stok geri eklenir), kargolanmış/teslim edilmiş → İade edildi. Parası iade edilmiş sipariş açık kalıp
 * hazırlanamaz/kargolanamaz. Kısmi iadede sipariş sürer. İade kaydı açık iade (cayma) bildirimini kapatır.
 */
export async function recordRefund(orderId: string, input: RefundInput, actorId: string | null) {
  if (!Number.isInteger(input.amountKurus) || input.amountKurus <= 0) {
    throw new OrderTransitionError("İade tutarı geçersiz.", 400);
  }
  const reason = input.reason.trim();
  if (reason.length < 3) throw new OrderTransitionError("İade sebebini yazın.", 400);

  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    const paid = await paidAmountKurus(tx, orderId);
    if (paid <= 0) {
      throw new OrderTransitionError("Bu siparişin alınmış bir ödemesi yok; iade kaydı girilmez (gerekirse iptal edin).");
    }
    const refunded = await refundedAmountKurus(tx, orderId);
    const remaining = paid - refunded;
    if (input.amountKurus > remaining) {
      throw new OrderTransitionError(
        `İade tutarı iade edilebilir tutarı aşıyor (alınan ${formatPrice(paid)}, daha önce iade ${formatPrice(refunded)}).`,
        400
      );
    }

    const closes = refunded + input.amountKurus >= paid && order.status !== "CANCELLED" && order.status !== "REFUNDED";
    const refund = await tx.refund.create({
      data: {
        orderId,
        amountKurus: input.amountKurus,
        method: input.method,
        reference: input.reference?.trim().slice(0, 120) || null,
        reason: reason.slice(0, 2000),
        createdById: actorId,
      },
    });
    await recordOrderEvent(tx, {
      orderId,
      type: "REFUND",
      actorType: "ADMIN",
      actorId,
      visibleToCustomer: true,
      message: `${formatPrice(input.amountKurus)} ${REFUND_METHOD_TR[input.method]} yapıldı.`,
    });
    await writeOutbox(tx, {
      topic: "order.refunded",
      aggregateType: "order",
      aggregateId: orderId,
      dedupeKey: `order.refunded:${refund.id}`,
      payload: { orderId, refundId: refund.id, closes },
    });

    await tx.customerRequest.updateMany({
      where: { orderId, type: "RETURN", status: "OPEN" },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: actorId, resolutionNote: "İade kaydı girildi." },
    });

    if (closes) {
      const shipped = order.status === "SHIPPED" || order.status === "DELIVERED";
      await changeStatusInTx(tx, order, shipped ? "REFUNDED" : "CANCELLED", actorId, {
        actorType: "ADMIN",
        reason: shipped ? null : "ödemeniz iade edildi",
        restock: input.restock,
        refundId: refund.id,
      });
    }
    return refund;
  });
}

// ── Müşteri talepleri ────────────────────────────────────────────────────

/** Müşterinin bu siparişte yapabileceği işlemler (sipariş sayfasında düğmeler) */
export function customerOptions(status: OrderStatus) {
  return {
    /** Ödenmemiş sipariş müşteri tarafından hemen iptal edilir (stok geri döner) */
    canCancelNow: status === "PENDING",
    /** Ödenmiş/hazırlanan siparişte iptal isteği (işletme karar verir, iade yapar) */
    canRequestCancel: status === "PAID" || status === "PROCESSING",
    /** Kargolanmış/teslim edilmiş siparişte cayma (iade) bildirimi */
    canRequestReturn: status === "SHIPPED" || status === "DELIVERED",
  };
}

export async function cancelByCustomer(reference: string): Promise<{ orderId: string }> {
  const found = await prisma.order.findUnique({ where: { reference }, select: { id: true } });
  if (!found) throw new OrderTransitionError("Sipariş bulunamadı.", 404);
  await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, found.id);
    if (order.status !== "PENDING") {
      throw new OrderTransitionError("Bu sipariş artık doğrudan iptal edilemez; iptal isteği gönderin.");
    }
    if (order.needsAttention) {
      throw new OrderTransitionError("Bu siparişin ödemesi kontrol ediliyor; lütfen bizi arayın.");
    }
    await changeStatusInTx(tx, order, "CANCELLED", null, { actorType: "CUSTOMER", reason: "isteğiniz üzerine" });
  });
  return { orderId: found.id };
}

export interface CustomerRequestInput {
  type: CustomerRequestType;
  message: string;
  ipAddress?: string | null;
}

/** Aynı türde açık talep varsa yenisi açılmaz (o döner) */
export async function createCustomerRequest(reference: string, input: CustomerRequestInput) {
  const found = await prisma.order.findUnique({ where: { reference }, select: { id: true } });
  if (!found) throw new OrderTransitionError("Sipariş bulunamadı.", 404);
  const message = input.message.trim().slice(0, 2000);

  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, found.id);
    const opts = customerOptions(order.status);
    if (input.type === "CANCEL" && !opts.canRequestCancel) {
      throw new OrderTransitionError(
        order.status === "PENDING" ? "Ödenmemiş siparişi doğrudan iptal edebilirsiniz." : "Bu sipariş için iptal isteği gönderilemez."
      );
    }
    if (input.type === "RETURN" && !opts.canRequestReturn) {
      throw new OrderTransitionError("İade (cayma) bildirimi kargolanmış ya da teslim edilmiş siparişte yapılır.");
    }
    const open = await tx.customerRequest.findFirst({ where: { orderId: order.id, type: input.type, status: "OPEN" } });
    if (open) return { request: open, created: false };

    const request = await tx.customerRequest.create({
      data: { orderId: order.id, type: input.type, message, ipAddress: input.ipAddress ?? null },
    });
    await recordOrderEvent(tx, {
      orderId: order.id,
      type: "REQUEST",
      actorType: "CUSTOMER",
      visibleToCustomer: true,
      message: input.type === "CANCEL" ? "İptal isteğiniz bize ulaştı." : "İade (cayma) bildiriminiz bize ulaştı.",
    });
    await writeOutbox(tx, {
      topic: "order.customer_request",
      aggregateType: "order",
      aggregateId: order.id,
      dedupeKey: `order.request:${request.id}`,
      payload: { orderId: order.id, requestId: request.id, type: input.type },
    });
    return { request, created: true };
  });
}

/**
 * Müşterinin talebini reddeder; sipariş sürer. Kabul edilen talep elle kapatılmaz: iptal isteği sipariş iptal
 * edilince, iade bildirimi iade kaydı girilince kendiliğinden kapanır (talep "sonuçlandı" görünüp sipariş devam
 * etmesin).
 */
export async function rejectCustomerRequest(requestId: string, note: string | null | undefined, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const req = await tx.customerRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new OrderTransitionError("Talep bulunamadı.", 404);
    const text = note?.trim() || null;
    const { count } = await tx.customerRequest.updateMany({
      where: { id: requestId, status: "OPEN" },
      data: { status: "REJECTED", resolutionNote: text, resolvedAt: new Date(), resolvedById: actorId },
    });
    if (count !== 1) throw new OrderTransitionError("Talep zaten kapanmış.");
    await recordOrderEvent(tx, {
      orderId: req.orderId,
      type: "REQUEST",
      actorType: "ADMIN",
      actorId,
      visibleToCustomer: false,
      message: `${req.type === "CANCEL" ? "İptal isteği" : "İade bildirimi"} reddedildi${text ? `: ${text}` : ""}`,
    });
    await recordOrderEvent(tx, {
      orderId: req.orderId,
      type: "REQUEST",
      actorType: "ADMIN",
      actorId,
      visibleToCustomer: true,
      message:
        req.type === "CANCEL"
          ? "İptal isteğiniz kabul edilemedi; siparişiniz işleme devam ediyor. Sorunuz için bize ulaşabilirsiniz."
          : "İade (cayma) bildiriminiz kabul edilemedi. Ayrıntı için bize ulaşabilirsiniz.",
    });
    return { ...req, status: "REJECTED" as const };
  });
}

// ── Not ve fatura ───────────────────────────────────────────────────────

export async function addOrderNote(orderId: string, message: string, actorId: string) {
  const text = message.trim();
  if (text.length < 2) throw new OrderTransitionError("Not boş olamaz.", 400);
  await prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    await recordOrderEvent(tx, {
      orderId,
      type: "NOTE",
      actorType: "ADMIN",
      actorId,
      visibleToCustomer: false,
      message: text.slice(0, 2000),
    });
  });
}

export async function setInvoice(orderId: string, input: { invoiceNumber: string; issuedAt: Date }, actorId: string) {
  const invoiceNumber = input.invoiceNumber.trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,60}$/.test(invoiceNumber)) throw new OrderTransitionError("Fatura numarası geçersiz.", 400);
  await prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    await tx.order.update({ where: { id: orderId }, data: { invoiceNumber, invoiceIssuedAt: input.issuedAt } });
    await recordOrderEvent(tx, {
      orderId,
      type: "INVOICE",
      actorType: "ADMIN",
      actorId,
      visibleToCustomer: true,
      message: `Faturanız düzenlendi (no: ${invoiceNumber}).`,
    });
  });
}
