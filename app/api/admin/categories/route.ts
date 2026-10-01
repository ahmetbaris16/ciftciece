/**
 * Admin Categories API
 *
 * GET  /api/admin/categories — Tüm kategoriler
 * POST /api/admin/categories — Yeni kategori
 * PUT  /api/admin/categories — Kategori güncelle (body'de id)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/security/audit";
import { getCategoriesForAdmin } from "@/lib/repositories";
import { z } from "zod";
import { revalidateStorefront } from "@/lib/cache/revalidate";

const USE_DB = !!process.env.DATABASE_URL;

export async function GET() {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const categories = await getCategoriesForAdmin();
    return NextResponse.json({ categories });
  } catch (err) {
    console.error("[admin/categories GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const CreateCategorySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  imageUrl: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).default(0),
  isPublished: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!USE_DB) return NextResponse.json({ error: "DB bağlantısı yok" }, { status: 503 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const existing = await prisma.category.findUnique({ where: { slug: parsed.data.slug } });
    if (existing) return NextResponse.json({ error: "Bu slug zaten kullanılıyor" }, { status: 409 });

    const category = await prisma.category.create({ data: parsed.data });

    await createAuditLog({
      userId: user.id,
      action: "category.create",
      entity: "category",
      entityId: category.id,
      details: { name: category.name },
    });

    revalidateStorefront();
    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    console.error("[admin/categories POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const UpdateCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(500).nullable().optional(),
  imageUrl: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isPublished: z.boolean().optional(),
});

export async function PUT(request: NextRequest) {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!USE_DB) return NextResponse.json({ error: "DB bağlantısı yok" }, { status: 503 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  const { id, ...data } = parsed.data;

  try {
    const category = await prisma.category.update({ where: { id }, data });

    await createAuditLog({
      userId: user.id,
      action: "category.update",
      entity: "category",
      entityId: id,
      details: { changes: data },
    });

    revalidateStorefront();
    return NextResponse.json({ category });
  } catch (err) {
    console.error("[admin/categories PUT]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
