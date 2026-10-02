/**
 * PATCH /api/admin/messages/[id] { status: NEW | READ | ANSWERED | ARCHIVED } — iletişim mesajının durumu.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { adminAction, AdminActionError } from "@/lib/admin/api";

const Schema = z.object({ status: z.enum(["NEW", "READ", "ANSWERED", "ARCHIVED"]) });

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return adminAction(request, Schema, async (input) => {
    const { count } = await prisma.contactMessage.updateMany({ where: { id }, data: { status: input.status } });
    if (count !== 1) throw new AdminActionError("Mesaj bulunamadı.", 404);
    return { status: input.status };
  });
}
