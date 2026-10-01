/**
 * Admin Order Detail API
 *
 * PUT /api/admin/orders/[id] — Durum güncelle
 * PENDING → PAID (havale onayı) markOrderPaid ile yapılır: ödeme kaydı da "başarılı" olur.
 * Kartla ödenmemiş sipariş elle "ödendi" yapılamaz — kart ödemesi yalnız sağlayıcı onayıyla işlenir.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/session";
import { getOrderByReference, markOrderPaid, updateOrderStatus } from "@/lib/repositories";
import { prisma } from "@/lib/db/prisma";
import { createAuditLog } from "@/lib/security/audit";
import { z } from "zod";
import type { OrderStatus } from "@/types";

const Schema = z.object({
  status: z.enum(["PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"]),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  try {
    if (parsed.data.status === "PAID") {
      const current = await prisma.order.findUnique({ where: { id }, select: { status: true, paymentMethod: true } });
      if (!current) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
      if (current.status === "PENDING") {
        if (current.paymentMethod === "CARD") {
          return NextResponse.json(
            { error: "Kart ödemesi elle onaylanamaz; ödeme sağlayıcısının onayı beklenir." },
            { status: 400 }
          );
        }
        const marked = await markOrderPaid(id, `admin:${user.id}`);
        if (marked.outcome === "not_found") return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
        await createAuditLog({
          userId: user.id,
          action: "order.payment_confirmed",
          entity: "order",
          entityId: id,
          details: { method: current.paymentMethod, outcome: marked.outcome },
        });
        return NextResponse.json({ order: await getOrderByReference(marked.reference) });
      }
    }

    const order = await updateOrderStatus(id, parsed.data.status as OrderStatus);
    if (!order) {
      return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
    }

    await createAuditLog({
      userId: user.id,
      action: "order.status_update",
      entity: "order",
      entityId: id,
      details: { newStatus: parsed.data.status },
    });

    return NextResponse.json({ order });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[admin/orders PUT]", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
