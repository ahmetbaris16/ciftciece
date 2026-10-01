/**
 * Admin Product Detail API
 *
 * PUT    /api/admin/products/[id] — Ürün güncelle
 * DELETE /api/admin/products/[id] — Ürün sil
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/security/audit";
import { z } from "zod";
import { revalidateStorefront } from "@/lib/cache/revalidate";

const USE_DB = !!process.env.DATABASE_URL;

const UpdateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(2000).nullable().optional(),
  categoryId: z.string().min(1).optional(),
  isPublished: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await requireAdminApi();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!USE_DB) {
    return NextResponse.json({ error: "DB bağlantısı yok" }, { status: 503 });
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Ürün bulunamadı" }, { status: 404 });
    }

    // Slug değişiyorsa benzersizlik kontrolü
    if (parsed.data.slug && parsed.data.slug !== existing.slug) {
      const slugExists = await prisma.product.findUnique({ where: { slug: parsed.data.slug } });
      if (slugExists) {
        return NextResponse.json({ error: "Bu slug zaten kullanılıyor" }, { status: 409 });
      }
    }

    const product = await prisma.product.update({
      where: { id },
      data: parsed.data,
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        variants: { orderBy: { sortOrder: "asc" }, include: { inventory: true } },
      },
    });

    await createAuditLog({
      userId: user.id,
      action: "product.update",
      entity: "product",
      entityId: id,
      details: { changes: parsed.data },
    });

    revalidateStorefront();
    return NextResponse.json({ product });
  } catch (err) {
    console.error("[admin/products PUT]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await requireAdminApi();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!USE_DB) {
    return NextResponse.json({ error: "DB bağlantısı yok" }, { status: 503 });
  }

  const { id } = await context.params;

  try {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Ürün bulunamadı" }, { status: 404 });
    }

    await prisma.product.delete({ where: { id } });

    await createAuditLog({
      userId: user.id,
      action: "product.delete",
      entity: "product",
      entityId: id,
      details: { name: existing.name },
    });

    revalidateStorefront();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/products DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
