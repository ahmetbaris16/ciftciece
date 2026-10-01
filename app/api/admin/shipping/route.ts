/**
 * Admin Kargo Ayarları (Yurtiçi Kargo)
 * GET /api/admin/shipping — mevcut ayarlar
 * PUT /api/admin/shipping — ücretsiz kargo eşiği, Yurtiçi desi tarifesi, koliler, ürün paket ölçüleri
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/security/audit";
import { getShippingSettings, saveShippingSettings } from "@/lib/shipping/shipping.repository";
import { PACKAGING_TYPES } from "@/lib/shipping/packaging";
import { revalidateStorefront } from "@/lib/cache/revalidate";

const cm = (label: string) =>
  z.number({ error: `${label} (cm) sayı olmalı.` }).positive({ error: `${label} (cm) 0'dan büyük olmalı.` }).max(300);

const MeasureSchema = z.object({
  grossGrams: z.number().int().min(1, { error: "Brüt ağırlık (g) girin." }).max(100_000),
  lengthCm: cm("En"),
  widthCm: cm("Boy"),
  heightCm: cm("Yükseklik"),
  fragile: z.boolean().optional(),
});

const BoxSchema = z.object({
  id: z.string().trim().min(1).max(40).regex(/^[a-z0-9-]+$/, { error: "Koli kimliği geçersiz." }),
  name: z.string().trim().min(1, { error: "Koli adı girin." }).max(60),
  lengthCm: cm("Koli eni"),
  widthCm: cm("Koli boyu"),
  heightCm: cm("Koli yüksekliği"),
  maxGrams: z.number().int().min(100, { error: "Kolinin taşıyabileceği ağırlığı girin." }).max(100_000),
  tareGrams: z.number().int().min(0).max(20_000),
});

const KNOWN_TYPES = new Set(PACKAGING_TYPES.map((t) => t.id));

const SettingsSchema = z.object({
  freeThresholdKurus: z.number().int().min(0).max(1_000_000_00),
  tariff: z.object({
    bands: z
      .array(
        z.object({
          maxDesi: z.number().positive({ error: "Tarife satırında desi 0'dan büyük olmalı." }).max(1000),
          priceKurus: z.number().int().min(0).max(100_000_00),
        })
      )
      .max(40)
      .refine((b) => b.every((x, i) => i === 0 || x.maxDesi > b[i - 1].maxDesi), {
        error: "Tarife satırları desiye göre artan sırada ve farklı olmalı.",
      }),
    extraPerDesiKurus: z.number().int().min(0).max(100_000_00).nullable(),
  }),
  packaging: z
    .record(z.string(), MeasureSchema)
    .refine((m) => Object.keys(m).every((k) => KNOWN_TYPES.has(k)), { error: "Bilinmeyen paket tipi." }),
  boxes: z
    .array(BoxSchema)
    .max(20)
    .refine((list) => new Set(list.map((b) => b.id)).size === list.length, { error: "Aynı koli iki kez eklenemez." }),
  recipientPaysWhenUnknown: z.boolean(),
});

export async function GET() {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  return NextResponse.json({ settings: await getShippingSettings() });
}

export async function PUT(request: NextRequest) {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ayarları kontrol edin." },
      { status: 400 }
    );
  }

  try {
    const settings = await saveShippingSettings(parsed.data);
    await createAuditLog({
      userId: user.id,
      action: "shipping.update",
      entity: "site_setting",
      details: settings as unknown as Record<string, unknown>,
    });
    revalidateStorefront();
    return NextResponse.json({ settings });
  } catch (err) {
    console.error("[admin/shipping PUT]", err);
    return NextResponse.json({ error: "Kaydedilemedi. Lütfen tekrar deneyin." }, { status: 500 });
  }
}
