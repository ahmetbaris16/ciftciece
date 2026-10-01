/**
 * POST /api/admin/orders/[id]/reconcile — "iyzico'dan sorgula" (elle mutabakat, tek sipariş)
 *
 * Siparişin kart denemelerini sağlayıcıya sorar, sunucu tarafı doğrulamayı uygular, gerekiyorsa
 * durumu düzeltir ve sonucu döndürür. Kim/ne zaman: payment_events (MANUAL) + audit_logs.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/session";
import { reconcileOrderWithProvider, ReconcileError } from "@/lib/payment/reconcile";
import { scheduleNotifications } from "@/lib/notifications/run";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  try {
    const result = await reconcileOrderWithProvider(id, user.id);
    scheduleNotifications();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ReconcileError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/orders reconcile]", err);
    return NextResponse.json({ error: "Sorgu tamamlanamadı. Tekrar deneyin." }, { status: 500 });
  }
}
