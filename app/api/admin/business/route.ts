/**
 * Admin — İşletme (satıcı) bilgileri
 * GET /api/admin/business — mevcut bilgiler
 * PUT /api/admin/business — unvan, vergi/MERSİS, adres, iletişim. Kaydedince vitrin (altbilgi, iletişim,
 * yasal metinler) yenilenir; e-postalar sonraki gönderimden itibaren yeni bilgiyle çıkar.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/security/audit";
import { isSameOrigin } from "@/lib/security/same-origin";
import { revalidateStorefront } from "@/lib/cache/revalidate";
import { getBusinessInfo, saveBusinessInfo } from "@/lib/business/business.repository";
import { BUSINESS_LIMITS, parseBusinessInfo, validateBusinessInfo } from "@/lib/business/info";

const text = (max: number) => z.string().trim().max(max, { error: `En fazla ${max} karakter.` });

const BusinessSchema = z.object({
  type: z.enum(["PERSON", "COMPANY", ""]),
  legalName: text(BUSINESS_LIMITS.legalName),
  tradeName: text(BUSINESS_LIMITS.tradeName).min(2, { error: "İşletme adı boş olamaz." }),
  taxOffice: text(BUSINESS_LIMITS.taxOffice),
  taxNumber: text(20),
  mersisNo: text(30),
  tradeRegistryNo: text(BUSINESS_LIMITS.tradeRegistryNo),
  kepAddress: text(BUSINESS_LIMITS.kepAddress),
  chamber: text(BUSINESS_LIMITS.chamber),
  address: text(BUSINESS_LIMITS.address),
  phone: text(20),
  whatsapp: text(20),
  email: text(BUSINESS_LIMITS.email),
  notificationEmail: text(BUSINESS_LIMITS.email),
  instagramUrl: text(BUSINESS_LIMITS.instagramUrl),
});

export async function GET() {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  return NextResponse.json({ business: await getBusinessInfo() });
}

export async function PUT(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const parsed = BusinessSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bilgileri kontrol edin." }, { status: 400 });
  }
  // Ayrıştırıcı rakam dışı karakterleri temizler, e-postaları küçük harfe çevirir
  const info = parseBusinessInfo(JSON.stringify(parsed.data));
  const errors = validateBusinessInfo(info);
  if (errors.length > 0) return NextResponse.json({ error: errors[0], errors }, { status: 400 });

  try {
    const saved = await saveBusinessInfo(info);
    await createAuditLog({
      userId: user.id,
      action: "business_info.update",
      entity: "site_setting",
      entityId: "business",
      details: saved as unknown as Record<string, unknown>,
    });
    revalidateStorefront();
    return NextResponse.json({ business: saved });
  } catch (err) {
    console.error("[admin/business PUT]", err);
    return NextResponse.json({ error: "Kaydedilemedi. Lütfen tekrar deneyin." }, { status: 500 });
  }
}
