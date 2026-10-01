/**
 * POST /api/payment/webhook
 *
 * Provider'dan gelen webhook event'leri.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payment/provider";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { markOrderPaid } from "@/lib/repositories";

const USE_DB = !!process.env.DATABASE_URL;

export async function POST(request: NextRequest) {
  if (!USE_DB) {
    return NextResponse.json({ error: "DB bağlantısı yok" }, { status: 503 });
  }

  try {
    const rawBody = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => { headers[key] = value; });

    const provider = getPaymentProvider();
    const event = await provider.parseWebhook(rawBody, headers);

    if (!event) {
      return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
    }

    // Idempotency: aynı event ID tekrar işlenmesin
    if (event.providerEventId) {
      const existing = await prisma.paymentEvent.findUnique({
        where: { providerEventId: event.providerEventId },
      });
      if (existing) {
        return NextResponse.json({ status: "already_processed" });
      }
    }

    // Event kaydet
    const payment = event.orderId
      ? await prisma.payment.findFirst({ where: { orderId: event.orderId } })
      : null;

    if (payment) {
      await prisma.paymentEvent.create({
        data: {
          paymentId: payment.id,
          providerEventId: event.providerEventId,
          eventType: event.eventType,
          payload: event.payload as Prisma.InputJsonValue,
        },
      });

      // Durum güncelle
      if (event.status === "SUCCESS") {
        // verify callback ile aynı güvenli yol (idempotent, süresi dolmuş sipariş kontrolü)
        await markOrderPaid(payment.orderId);
      } else if (event.status === "FAILED") {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
      } else if (event.status === "REFUNDED") {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
        await prisma.order.update({ where: { id: payment.orderId }, data: { status: "REFUNDED" } });
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[payment/webhook]", err);
    // Sağlayıcıya 500 → tekrar denesin
    return NextResponse.json({ error: "webhook_failed" }, { status: 500 });
  }
}
