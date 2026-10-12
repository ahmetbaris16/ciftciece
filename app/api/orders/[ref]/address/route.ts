/**
 * POST /api/orders/[ref]/address { firstName, lastName, phone, city, district, address, postalCode? }
 *
 * Müşteri teslimat bilgisini değiştirir (sipariş kargoya verilene kadar; lib/orders/lifecycle.ts). Sipariş
 * numarası tek başına yetmez — izin: siparişi veren tarayıcının çerezi, üye siparişinde sahibi olan hesap ya da
 * e-postadaki bağlantıyla verilmiş çerez (lib/orders/access.ts). İzin yoksa 403 { needsVerification: true }:
 * sayfa "bağlantıyı e-postama gönder"i gösterir. Değişiklikte müşteriye ve işletmeye e-posta gider.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";
import { getCurrentCustomer } from "@/lib/auth/session";
import { ORDER_ACCESS_COOKIE, hasOrderAccess } from "@/lib/orders/access";
import { changeShippingAddress } from "@/lib/orders/lifecycle";
import { OrderTransitionError } from "@/lib/repositories/order.repository";
import { DeliveryChangeSchema, toFieldErrors } from "@/lib/validation/checkout";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { isSameOrigin } from "@/lib/security/same-origin";
import { scheduleNotifications } from "@/lib/notifications/run";

export const dynamic = "force-dynamic";

const NEEDS_VERIFICATION_MESSAGE =
  "Güvenliğiniz için teslimat bilgileri siparişi verdiğiniz cihazdan ya da e-postanıza gönderdiğimiz bağlantıyla değiştirilir.";

export async function POST(request: NextRequest, context: { params: Promise<{ ref: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  if (!USE_DB) return NextResponse.json({ error: "Şu anda işlem yapılamıyor." }, { status: 503 });
  if (!rateLimit(`order-address:${clientIp(request.headers)}`, 10, 15 * 60_000)) {
    return NextResponse.json({ error: "Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin." }, { status: 429 });
  }

  const { ref } = await context.params;
  const order = await prisma.order.findUnique({ where: { reference: ref }, select: { id: true, userId: true } });
  if (!order) return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });

  const viaCookie = hasOrderAccess(request.cookies.get(ORDER_ACCESS_COOKIE)?.value, ref);
  const owner = !viaCookie && order.userId ? await getCurrentCustomer().catch(() => null) : null;
  if (!viaCookie && !(owner && owner.id === order.userId)) {
    return NextResponse.json({ error: NEEDS_VERIFICATION_MESSAGE, needsVerification: true }, { status: 403 });
  }

  const parsed = DeliveryChangeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const { fieldErrors, message } = toFieldErrors(parsed.error);
    return NextResponse.json({ error: message, fieldErrors }, { status: 400 });
  }

  try {
    const { changed } = await changeShippingAddress(order.id, parsed.data, { type: "CUSTOMER" });
    if (changed) scheduleNotifications();
    return NextResponse.json({ ok: true, changed });
  } catch (err) {
    if (err instanceof OrderTransitionError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[orders/address]", err);
    return NextResponse.json({ error: "Kaydedilemedi. Lütfen tekrar deneyin ya da bizi arayın." }, { status: 500 });
  }
}
