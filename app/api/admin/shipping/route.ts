/**
 * Admin Kargo Ayarları (Yurtiçi Kargo)
 * GET /api/admin/shipping — mevcut ayarlar
 * PUT /api/admin/shipping { feeKurus, freeThresholdKurus } — sabit kargo ücreti ve ücretsiz kargo sınırı
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/session";
import { adminAction } from "@/lib/admin/api";
import { createAuditLog } from "@/lib/security/audit";
import { getShippingSettings, saveShippingSettings } from "@/lib/shipping/shipping.repository";
import { revalidateStorefront } from "@/lib/cache/revalidate";

const Schema = z.object({
  feeKurus: z.number({ error: "Kargo ücretini yazın." }).int().min(0).max(100_000_00, { error: "Kargo ücreti çok yüksek." }),
  freeThresholdKurus: z
    .number({ error: "Ücretsiz kargo sınırını yazın." })
    .int()
    .min(0)
    .max(1_000_000_00, { error: "Ücretsiz kargo sınırı çok yüksek." }),
});

export async function GET() {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  return NextResponse.json({ settings: await getShippingSettings() });
}

export async function PUT(request: NextRequest) {
  return adminAction(request, Schema, async (input, user) => {
    const settings = await saveShippingSettings(input);
    await createAuditLog({
      userId: user.id,
      action: "shipping.update",
      entity: "site_setting",
      details: { feeKurus: settings.feeKurus, freeThresholdKurus: settings.freeThresholdKurus },
    });
    revalidateStorefront();
    return settings;
  });
}
