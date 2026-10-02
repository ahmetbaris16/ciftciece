/**
 * POST /api/admin/emails/[id]/requeue — gönderilemeyen (ya da iptal edilen) e-postayı yeniden kuyruğa alır;
 * deneme sayacı sıfırlanır ve gönderim hemen denenir.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminAction } from "@/lib/admin/api";
import { requeueEmail } from "@/lib/notifications/sender";
import { OrderTransitionError } from "@/lib/repositories/order.repository";
import { createAuditLog } from "@/lib/security/audit";
import { scheduleNotifications } from "@/lib/notifications/run";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return adminAction(request, z.unknown(), async (_input, user) => {
    const ok = await requeueEmail(id);
    if (!ok) throw new OrderTransitionError("Bu e-posta yeniden gönderilemez (zaten kuyrukta ya da gönderildi).", 409);
    await createAuditLog({ userId: user.id, action: "email.requeue", entity: "email", entityId: id, details: {} });
    scheduleNotifications();
    return { requeued: true };
  });
}
