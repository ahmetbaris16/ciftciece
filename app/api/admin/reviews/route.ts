/**
 * Admin Reviews API
 *
 * GET  /api/admin/reviews — Tüm yorumlar
 * POST /api/admin/reviews — Yeni yorum ekle
 * PUT  /api/admin/reviews — Yorum güncelle (metin, puan, tarih, yayın durumu)
 * DELETE /api/admin/reviews?id=... — Yorum sil
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/session";
import { getAllReviews } from "@/lib/repositories";
import { z } from "zod";
import { revalidateStorefront } from "@/lib/cache/revalidate";

const USE_DB = !!process.env.DATABASE_URL;

export async function GET() {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const reviews = await getAllReviews();
  return NextResponse.json({ reviews });
}

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Tarihi YYYY-AA-GG biçiminde girin." })
  .transform((v) => new Date(`${v}T12:00:00Z`));

const CreateReviewSchema = z.object({
  authorName: z.string().trim().min(1, { error: "Yazar adını girin." }).max(100),
  rating: z.number().int().min(1).max(5),
  // Google'da yalnızca yıldız veren yorumlar da olabilir
  text: z.string().trim().max(1000).default(""),
  date: dateField,
  source: z.string().trim().max(50).optional(),
  sourceUrl: z.string().url().optional(),
  isPublished: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
});

export async function POST(request: NextRequest) {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  if (!USE_DB) return NextResponse.json({ error: "Veritabanı bağlantısı yok." }, { status: 503 });

  const body = await request.json().catch(() => null);
  const parsed = CreateReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bilgileri kontrol edin." }, { status: 400 });
  }

  const review = await prisma.review.create({ data: parsed.data });
  revalidateStorefront();
  return NextResponse.json({ review }, { status: 201 });
}

const UpdateReviewSchema = z.object({
  id: z.string().min(1),
  authorName: z.string().trim().min(1, { error: "Yazar adını girin." }).max(100).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  text: z.string().trim().max(1000).optional(),
  date: dateField.optional(),
  source: z.string().trim().max(50).nullable().optional(),
  isPublished: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function PUT(request: NextRequest) {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  if (!USE_DB) return NextResponse.json({ error: "Veritabanı bağlantısı yok." }, { status: 503 });

  const body = await request.json().catch(() => null);
  const parsed = UpdateReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bilgileri kontrol edin." }, { status: 400 });
  }

  const { id, ...data } = parsed.data;
  try {
    const review = await prisma.review.update({ where: { id }, data });
    revalidateStorefront();
    return NextResponse.json({ review });
  } catch (err) {
    console.error("[admin/reviews PUT]", err);
    return NextResponse.json({ error: "Yorum güncellenemedi." }, { status: 404 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  if (!USE_DB) return NextResponse.json({ error: "Veritabanı bağlantısı yok." }, { status: 503 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Yorum seçilmedi." }, { status: 400 });
  try {
    await prisma.review.delete({ where: { id } });
    revalidateStorefront();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/reviews DELETE]", err);
    return NextResponse.json({ error: "Yorum silinemedi." }, { status: 404 });
  }
}
