/**
 * Admin Inventory API
 *
 * PUT /api/admin/inventory — Toplu stok güncelleme
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/security/audit";
import { z } from "zod";
import { revalidateStorefront } from "@/lib/cache/revalidate";

const USE_DB = !!process.env.DATABASE_URL;

const BulkStockSchema = z.object({
  updates: z.array(z.object({
    variantId: z.string().min(1),
    quantity: z.number().int().min(0),
  })).min(1).max(100),
});

export async function PUT(request: NextRequest) {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!USE_DB) return NextResponse.json({ error: "DB bağlantısı yok" }, { status: 503 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BulkStockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const results = await prisma.$transaction(
      parsed.data.updates.map((u) =>
        prisma.inventory.upsert({
          where: { variantId: u.variantId },
          update: { quantity: u.quantity },
          create: { variantId: u.variantId, quantity: u.quantity },
        })
      )
    );

    await createAuditLog({
      userId: user.id,
      action: "inventory.bulk_update",
      entity: "inventory",
      details: { count: results.length },
    });

    revalidateStorefront();
    return NextResponse.json({ updated: results.length });
  } catch (err) {
    console.error("[admin/inventory PUT]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
