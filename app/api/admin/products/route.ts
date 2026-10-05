/**
 * Admin Products API
 *
 * GET  /api/admin/products — Tüm ürünler (admin, unpublished dahil)
 * POST /api/admin/products — Yeni ürün oluştur
 *
 * Auth: requireAdminApi()
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/security/audit";
import { getProductsForAdmin } from "@/lib/repositories";
import { z } from "zod";
import { revalidateStorefront } from "@/lib/cache/revalidate";
import { firstFreeSlug, slugify } from "@/lib/catalog/slug";

const USE_DB = !!process.env.DATABASE_URL;

export async function GET() {
  const user = await requireAdminApi();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const products = await getProductsForAdmin();
    return NextResponse.json({ products });
  } catch (err) {
    console.error("[admin/products GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST Schema ─────────────────────────────────────────────

const CreateProductSchema = z.object({
  name: z.string().min(1).max(200),
  // Boşsa ürün adından üretilir (panel göndermez)
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/, "Slug sadece küçük harf, rakam ve tire içerebilir").optional(),
  description: z.string().max(2000).optional(),
  categoryId: z.string().min(1),
  isPublished: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
  // KDV oranı baz puan (100 = %1); boş = girilmemiş (Y-12)
  vatRateBps: z.number().int().min(0).max(10_000).nullable().optional(),
  variants: z.array(z.object({
    name: z.string().min(1).max(100),
    sku: z.string().max(50).optional(),
    priceKurus: z.number().int().min(0),
    isAvailable: z.boolean().default(true),
    sortOrder: z.number().int().min(0).default(0),
    stockQuantity: z.number().int().min(0).default(0),
  })).min(1, "En az 1 varyant gerekli"),
});

export async function POST(request: NextRequest) {
  const user = await requireAdminApi();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!USE_DB) {
    return NextResponse.json({ error: "DB bağlantısı yok — ürün oluşturulamaz" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;

  try {
    // Ürün adresi: verilmediyse addan; aynısı varsa sonuna -2, -3…
    const base = data.slug ?? slugify(data.name);
    const taken = await prisma.product.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } });
    const slug = firstFreeSlug(base, taken.map((p) => p.slug));

    const product = await prisma.product.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        categoryId: data.categoryId,
        isPublished: data.isPublished,
        isFeatured: data.isFeatured,
        sortOrder: data.sortOrder,
        vatRateBps: data.vatRateBps ?? null,
        variants: {
          create: data.variants.map((v) => ({
            name: v.name,
            sku: v.sku,
            priceKurus: v.priceKurus,
            isAvailable: v.isAvailable,
            sortOrder: v.sortOrder,
            inventory: {
              create: { quantity: v.stockQuantity },
            },
          })),
        },
      },
      include: {
        variants: { include: { inventory: true } },
        category: true,
        images: true,
      },
    });

    await createAuditLog({
      userId: user.id,
      action: "product.create",
      entity: "product",
      entityId: product.id,
      details: { name: product.name, slug: product.slug },
    });

    revalidateStorefront();
    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    console.error("[admin/products POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
