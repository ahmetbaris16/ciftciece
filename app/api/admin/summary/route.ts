/**
 * GET /api/admin/summary — admin menüsündeki rozetler (bekleyen işler). Kişisel veri yok, yalnız sayılar.
 */

import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/session";
import { getAdminBadges } from "@/lib/admin/dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  try {
    return NextResponse.json({ badges: await getAdminBadges() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[admin/summary]", err);
    return NextResponse.json({ error: "Yüklenemedi" }, { status: 503 });
  }
}
