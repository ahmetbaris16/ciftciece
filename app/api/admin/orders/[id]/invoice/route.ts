/**
 * POST /api/admin/orders/[id]/invoice { invoiceNumber, issuedAt? } — e-Arşiv fatura numarası; müşteri sipariş
 * sayfasında görür.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminAction } from "@/lib/admin/api";
import { setInvoice } from "@/lib/orders/lifecycle";
import { OrderTransitionError } from "@/lib/repositories/order.repository";
import { createAuditLog } from "@/lib/security/audit";

const Schema = z.object({
  invoiceNumber: z.string().trim().min(3, { error: "Fatura numarasını girin." }).max(60),
  issuedAt: z.string().trim().optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return adminAction(request, Schema, async (input, user) => {
    const issuedAt = input.issuedAt ? new Date(input.issuedAt) : new Date();
    if (Number.isNaN(issuedAt.getTime())) throw new OrderTransitionError("Fatura tarihi geçersiz.", 400);
    await setInvoice(id, { invoiceNumber: input.invoiceNumber, issuedAt }, user.id);
    await createAuditLog({
      userId: user.id,
      action: "order.invoice_set",
      entity: "order",
      entityId: id,
      details: { invoiceNumber: input.invoiceNumber },
    });
  });
}
