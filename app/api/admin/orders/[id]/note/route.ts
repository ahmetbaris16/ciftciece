/**
 * POST /api/admin/orders/[id]/note { message } — iç not (müşteri görmez), sipariş geçmişine eklenir.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminAction } from "@/lib/admin/api";
import { addOrderNote } from "@/lib/orders/lifecycle";

const Schema = z.object({ message: z.string().trim().min(2, { error: "Not boş olamaz." }).max(2000) });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return adminAction(request, Schema, async (input, user) => {
    await addOrderNote(id, input.message, user.id);
  });
}
