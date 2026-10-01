/**
 * PATCH /api/admin/requests/[id] { status: RESOLVED | REJECTED, note? } — müşteri iptal/iade talebini kapatır.
 * Para iadesi ayrıca iade kaydıyla girilir (/api/admin/orders/[id]/refund).
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminAction } from "@/lib/admin/api";
import { resolveCustomerRequest } from "@/lib/orders/lifecycle";

const Schema = z.object({
  status: z.enum(["RESOLVED", "REJECTED"]),
  note: z.string().trim().max(2000).optional().nullable(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return adminAction(request, Schema, async (input, user) => {
    const r = await resolveCustomerRequest(id, input, user.id);
    return { status: r.status };
  });
}
