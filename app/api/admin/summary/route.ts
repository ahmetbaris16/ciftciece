/**
 * GET /api/admin/summary — admin menüsündeki rozetler (bekleyen işler) ve değişim damgası (açık panel sayfası
 * damga değişince kendini yeniler). Kişisel veri yok, yalnız sayılar.
 */

import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/session";
import { getAdminPulse } from "@/lib/admin/dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  try {
    return NextResponse.json(await getAdminPulse(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[admin/summary]", err);
    return NextResponse.json({ error: "Yüklenemedi" }, { status: 503 });
  }
}
