/**
 * Admin Variants API
 *
 * POST   /api/admin/products/[id]/variants — Yeni varyant ekle
 * PUT    /api/admin/products/[id]/variants — Varyant güncelle (body'de variantId)
 * DELETE /api/admin/products/[id]/variants — Varyant sil (body'de variantId)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/security/audit";
import { z } from "zod";
import { revalidateStorefront } from "@/lib/cache/revalidate";
import { StockChangedError, updateVariantAndStock } from "@/lib/repositories/inventory.repository";

const USE_DB = !!process.env.DATABASE_URL;

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ── POST — Yeni varyant ─────────────────────────────────────

const CreateVariantSchema = z.object({
  name: z.string().min(1).max(100),
  sku: z.string().max(50).optional(),
  priceKurus: z.number().int().min(0),
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  stockQuantity: z.number().int().min(0).default(0),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!USE_DB) return NextResponse.json({ error: "DB bağlantısı yok" }, { status: 503 });

  const { id: productId } = await context.params;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateVariantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return NextResponse.json({ error: "Ürün bulunamadı" }, { status: 404 });

    const variant = await prisma.productVariant.create({
      data: {
        productId,
        name: parsed.data.name,
        sku: parsed.data.sku,
        priceKurus: parsed.data.priceKurus,
        isAvailable: parsed.data.isAvailable,
        sortOrder: parsed.data.sortOrder,
        inventory: { create: { quantity: parsed.data.stockQuantity } },
      },
      include: { inventory: true },
    });

    await createAuditLog({
      userId: user.id,
      action: "variant.create",
      entity: "product_variant",
      entityId: variant.id,
      details: { productId, name: variant.name },
    });

    revalidateStorefront();
    return NextResponse.json({ variant }, { status: 201 });
  } catch (err) {
    console.error("[admin/variants POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PUT — Varyant güncelle ──────────────────────────────────

const UpdateVariantSchema = z.object({
  variantId: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  sku: z.string().max(50).nullable().optional(),
  priceKurus: z.number().int().min(0).optional(),
  isAvailable: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  stockQuantity: z.number().int().min(0).optional(),
  // Formun açıldığı andaki stok: yeni stok yalnız bu değer hâlâ geçerliyse yazılır (R-06)
  expectedStock: z.number().int().min(0).optional(),
}).refine((d) => d.stockQuantity === undefined || d.expectedStock !== undefined, {
  message: "Stok güncellemesi için sayfadaki önceki stok (expectedStock) gerekli",
  path: ["expectedStock"],
});

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!USE_DB) return NextResponse.json({ error: "DB bağlantısı yok" }, { status: 503 });

  const { id: productId } = await context.params;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateVariantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  const { variantId, stockQuantity, expectedStock, ...variantData } = parsed.data;
  const stock =
    stockQuantity !== undefined && expectedStock !== undefined ? { expected: expectedStock, quantity: stockQuantity } : undefined;

  try {
    // Varyant bilgisi ve stok tek işlemde: stok bu arada değiştiyse hiçbiri yazılmaz
    const updated = await updateVariantAndStock(productId, variantId, variantData, stock);
    if (!updated) return NextResponse.json({ error: "Varyant bulunamadı" }, { status: 404 });

    await createAuditLog({
      userId: user.id,
      action: "variant.update",
      entity: "product_variant",
      entityId: variantId,
      details: { productId, changes: parsed.data },
    });

    revalidateStorefront();
    return NextResponse.json({ variant: updated });
  } catch (err) {
    if (err instanceof StockChangedError) {
      const c = err.conflicts[0];
      return NextResponse.json(
        {
          error: `Stok bu arada değişti: sayfayı açtığınızda ${c.expected} idi, şimdi ${c.current ?? "kayıt yok"}. Sayfayı yenileyip yeni değere göre tekrar girin.`,
          code: "STOCK_CHANGED",
          current: c.current,
        },
        { status: 409 }
      );
    }
    console.error("[admin/variants PUT]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE — Varyant sil ────────────────────────────────────

const DeleteVariantSchema = z.object({
  variantId: z.string().min(1),
});

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!USE_DB) return NextResponse.json({ error: "DB bağlantısı yok" }, { status: 503 });

  const { id: productId } = await context.params;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = DeleteVariantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  try {
    const variant = await prisma.productVariant.findFirst({
      where: { id: parsed.data.variantId, productId },
    });
    if (!variant) return NextResponse.json({ error: "Varyant bulunamadı" }, { status: 404 });

    await prisma.productVariant.delete({ where: { id: parsed.data.variantId } });

    await createAuditLog({
      userId: user.id,
      action: "variant.delete",
      entity: "product_variant",
      entityId: parsed.data.variantId,
      details: { productId, name: variant.name },
    });

    revalidateStorefront();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/variants DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
