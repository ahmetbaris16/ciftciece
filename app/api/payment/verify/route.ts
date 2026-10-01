/**
 * /api/payment/verify — ödeme sağlayıcısı dönüşü (3DS / callback)
 *
 * Akış:
 * 1. Sağlayıcıdan token doğrulanır (stub: kendi token'ı dışında reddeder)
 * 2. Sağlayıcı tutar bildiriyorsa sipariş tutarıyla karşılaştırılır
 * 3. markOrderPaid: PENDING → PAID (idempotent); süresi dolmuş siparişte stok
 *    yeniden ayrılamıyorsa admin incelemesine düşer
 * 4. Müşteri sipariş sayfasına yönlendirilir (sepet orada, ödeme onaylıysa temizlenir)
 */

import { NextRequest, NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payment/provider";
import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";
import { markOrderPaid } from "@/lib/repositories";

async function handle(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const fail = (code: string) => NextResponse.redirect(`${appUrl}/odeme?error=${code}`);

  if (!USE_DB) return fail("payment_error");

  const { searchParams } = new URL(request.url);
  let token = searchParams.get("token") ?? "";
  const orderId = searchParams.get("orderId") ?? "";
  if (!token && request.method === "POST") {
    // Bazı sağlayıcılar token'ı form gövdesinde gönderir
    const form = await request.formData().catch(() => null);
    token = (form?.get("token") as string | null) ?? "";
  }

  try {
    const provider = getPaymentProvider();
    const result = await provider.verifyPayment({ token });
    if (!result.success) {
      console.warn("[payment/verify] Doğrulama başarısız:", result.error);
      return fail("payment_failed");
    }

    // Sağlayıcı sipariş kimliği bildiriyorsa (iyzico: basketId) callback'teki orderId ile aynı olmalı
    if (result.orderId && orderId && result.orderId !== orderId) {
      console.error(`[payment/verify] Sipariş kimliği uyuşmuyor: callback ${orderId}, sağlayıcı ${result.orderId}`);
      return fail("payment_error");
    }
    const resolvedOrderId = result.orderId ?? orderId;
    const order = resolvedOrderId ? await prisma.order.findUnique({ where: { id: resolvedOrderId } }) : null;
    if (!order) {
      console.warn("[payment/verify] Sipariş bulunamadı, orderId:", resolvedOrderId);
      return fail("payment_not_found");
    }

    if (result.amountKurus !== undefined && result.amountKurus !== order.totalKurus) {
      console.error(
        `[payment/verify] TUTAR UYUŞMUYOR ${order.reference}: sağlayıcı ${result.amountKurus}, sipariş ${order.totalKurus}`
      );
      await prisma.order.update({
        where: { id: order.id },
        data: { notes: "DİKKAT: Ödeme tutarı sipariş tutarıyla uyuşmuyor — kontrol edin." },
      });
      return NextResponse.redirect(`${appUrl}/siparis/${order.reference}`);
    }

    const marked = await markOrderPaid(order.id, result.providerRef);
    if (result.note && marked.outcome !== "not_found") {
      await prisma.order.update({ where: { id: order.id }, data: { notes: result.note } });
    }
    if (marked.outcome === "not_found") return fail("payment_not_found");
    return NextResponse.redirect(`${appUrl}/siparis/${marked.reference}`);
  } catch (err) {
    console.error("[payment/verify]", err);
    return fail("payment_error");
  }
}

export const GET = handle;
export const POST = handle;
