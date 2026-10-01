/**
 * POST /api/payment/create
 *
 * Sipariş ID ile KART ödemesini başlatır (havale ve kapıda ödeme bu adımı kullanmaz).
 */

import { NextRequest, NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payment/provider";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { CHECKOUT_MESSAGES } from "@/lib/validation/checkout";
import { getPaymentSettings } from "@/lib/payment/settings.repository";
import { clientIp } from "@/lib/security/rate-limit";

const USE_DB = !!process.env.DATABASE_URL;

const Schema = z.object({
  orderId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  if (!USE_DB) {
    return NextResponse.json({ error: CHECKOUT_MESSAGES.serviceUnavailable }, { status: 503 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: CHECKOUT_MESSAGES.paymentFailed }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: CHECKOUT_MESSAGES.paymentFailed }, { status: 400 });
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: parsed.data.orderId },
      include: { items: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Sipariş bulunamadı. Lütfen tekrar sipariş verin." }, { status: 404 });
    }

    if (order.paymentMethod !== "CARD") {
      return NextResponse.json({ error: "Bu sipariş kartla ödenmiyor.", code: "NOT_CARD" }, { status: 409 });
    }

    if (order.status !== "PENDING") {
      return NextResponse.json({ error: "Bu siparişin ödemesi zaten alınmış ya da sipariş kapanmış." , code: "NOT_PENDING" }, { status: 409 });
    }

    const provider = getPaymentProvider();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const paymentSettings = await getPaymentSettings();

    const result = await provider.createPayment({
      orderId: order.id,
      orderReference: order.reference,
      amountKurus: order.totalKurus,
      currency: "TRY",
      buyer: {
        email: order.guestEmail ?? "",
        firstName: order.guestName?.split(" ")[0] ?? "",
        lastName: order.guestName?.split(" ").slice(1).join(" ") ?? "",
        phone: order.guestPhone ?? "",
        city: (order.shippingAddress as Record<string, string>)?.city ?? "",
        address: (order.shippingAddress as Record<string, string>)?.address ?? "",
      },
      // Ödeme sağlayıcısında kalemlerin toplamı sipariş tutarına eşit olmalı → kargo da kalem
      items: [
        ...order.items.map((i) => ({
          name: `${i.snapshotName} - ${i.snapshotVariant}`,
          priceKurus: i.snapshotPrice,
          quantity: i.quantity,
        })),
        ...(order.shippingKurus > 0
          ? [{ name: "Kargo", priceKurus: order.shippingKurus, quantity: 1 }]
          : []),
      ],
      // orderId sorguda taşınır; verify ayrıca sağlayıcının bildirdiği sipariş kimliğiyle karşılaştırır
      callbackUrl: `${appUrl}/api/payment/verify?orderId=${encodeURIComponent(order.id)}`,
      buyerId: order.userId ?? undefined,
      buyerIp: clientIp(request.headers),
      maxInstallment: paymentSettings.card.maxInstallment,
    });

    if (!result.success) {
      // Sağlayıcının ham hata metni loglanır, müşteriye gösterilmez
      console.error("[payment/create] provider error:", result.error);
      return NextResponse.json({ error: CHECKOUT_MESSAGES.paymentFailed }, { status: 502 });
    }

    // Payment kaydı — sipariş başına tek kayıt (orderId unique).
    // Müşteri ödemeyi yeniden denediğinde (sipariş hâlâ PENDING) mevcut kayıt
    // yeni sağlayıcı referansıyla güncellenir; yeni sipariş açılmaz.
    await prisma.payment.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        provider: provider.name,
        providerRef: result.providerRef,
        status: "PENDING",
        amountKurus: order.totalKurus,
      },
      update: {
        provider: provider.name,
        providerRef: result.providerRef,
        status: "PENDING",
        amountKurus: order.totalKurus,
      },
    });

    return NextResponse.json({
      redirectUrl: result.redirectUrl,
      checkoutFormHtml: result.checkoutFormHtml,
    });
  } catch (err) {
    console.error("[payment/create]", err);
    return NextResponse.json({ error: CHECKOUT_MESSAGES.paymentFailed }, { status: 500 });
  }
}
