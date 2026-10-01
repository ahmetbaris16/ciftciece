/**
 * Admin Inventory API
 *
 * PUT /api/admin/inventory — Toplu stok güncelleme
 *
 * Her satır, admin'in gördüğü önceki değerle (expectedQuantity) gelir: değer bu arada değiştiyse
 * (satış, iptal) hiçbir satır yazılmaz, 409 döner (R-06; bkz. lib/repositories/inventory.repository.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/security/audit";
import { z } from "zod";
import { revalidateStorefront } from "@/lib/cache/revalidate";
import { StockChangedError, writeStockBulk } from "@/lib/repositories/inventory.repository";

const USE_DB = !!process.env.DATABASE_URL;

const BulkStockSchema = z.object({
  updates: z.array(z.object({
    variantId: z.string().min(1),
    quantity: z.number().int().min(0),
    expectedQuantity: z.number().int().min(0),
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

  const writes = parsed.data.updates.map((u) => ({ variantId: u.variantId, expected: u.expectedQuantity, quantity: u.quantity }));
  try {
    await writeStockBulk(writes);

    await createAuditLog({
      userId: user.id,
      action: "inventory.bulk_update",
      entity: "inventory",
      details: { updates: writes },
    });

    revalidateStorefront();
    return NextResponse.json({ updated: writes.length });
  } catch (err) {
    if (err instanceof StockChangedError) {
      return NextResponse.json(
        { error: "Stok bu arada değişti; hiçbir satır yazılmadı. Güncel değerleri alıp tekrar deneyin.", code: "STOCK_CHANGED", conflicts: err.conflicts },
        { status: 409 }
      );
    }
    console.error("[admin/inventory PUT]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
