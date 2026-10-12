/**
 * POST /api/orders/[ref]/address-link — teslimat bilgisini başka cihazdan değiştirmek isteyen müşteriye sipariş
 * e-postasına 24 saatlik bağlantı gönderir (lib/orders/access.ts). Bağlantı yalnız siparişteki e-posta adresine
 * gider: sipariş numarasını bilen başkası adresi değiştiremez. Yanıtta adres maskelenir.
 *
 * Sınır: IP başına 15 dakikada 5, sipariş başına saatte 3 istek (gelen kutusu doldurulmasın).
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";
import { ORDER_LINK_HOURS, orderLinkToken } from "@/lib/orders/access";
import { canChangeDelivery } from "@/lib/orders/lifecycle";
import { loadOrderEmailData } from "@/lib/notifications/order-data";
import { enqueueEmail } from "@/lib/notifications/queue";
import { scheduleNotifications } from "@/lib/notifications/run";
import { deliveryLinkEmail } from "@/lib/email/templates/order";
import { replyToFor, siteUrl } from "@/lib/email/brand";
import { maskEmail } from "@/lib/email/transport";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { isSameOrigin } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

const TOO_MANY = "Çok fazla istek yapıldı. Biraz sonra tekrar deneyin ya da bizi arayın.";

export async function POST(request: NextRequest, context: { params: Promise<{ ref: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  if (!USE_DB) return NextResponse.json({ error: "Şu anda işlem yapılamıyor." }, { status: 503 });
  if (!rateLimit(`order-address-link:${clientIp(request.headers)}`, 5, 15 * 60_000)) {
    return NextResponse.json({ error: TOO_MANY }, { status: 429 });
  }

  const { ref } = await context.params;
  const order = await prisma.order.findUnique({ where: { reference: ref }, select: { id: true, status: true } });
  if (!order) return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });
  if (!canChangeDelivery(order.status)) {
    return NextResponse.json(
      { error: "Sipariş kargoya verildi ya da kapandı; teslimat bilgisi artık buradan değiştirilemez. Bizi arayın." },
      { status: 409 }
    );
  }
  if (!rateLimit(`order-address-link:order:${order.id}`, 3, 60 * 60_000)) {
    return NextResponse.json({ error: TOO_MANY }, { status: 429 });
  }

  try {
    const d = await loadOrderEmailData(order.id);
    if (!d?.customerEmail) {
      return NextResponse.json({ error: "Siparişte e-posta adresi yok; değişiklik için bizi arayın." }, { status: 400 });
    }
    const link = `${siteUrl()}/siparis/${encodeURIComponent(ref)}/adres?t=${orderLinkToken(ref)}`;
    const mail = deliveryLinkEmail(d, link, ORDER_LINK_HOURS);
    await enqueueEmail(prisma, {
      kind: "ADDRESS_LINK",
      dedupeKey: `address-link:${order.id}:${randomUUID()}`,
      orderId: order.id,
      audience: "customer",
      to: d.customerEmail,
      replyTo: replyToFor(d.business),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      // Bağlantının süresi dolduysa (e-posta gönderilemeden beklediyse) gönderilmez
      expiresAt: new Date(Date.now() + ORDER_LINK_HOURS * 3_600_000),
    });
    scheduleNotifications();
    return NextResponse.json({ ok: true, sentTo: maskEmail(d.customerEmail) });
  } catch (err) {
    console.error("[orders/address-link]", err);
    return NextResponse.json({ error: "Bağlantı gönderilemedi. Lütfen tekrar deneyin ya da bizi arayın." }, { status: 500 });
  }
}
