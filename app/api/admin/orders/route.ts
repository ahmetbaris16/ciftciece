/**
 * Admin Orders API
 *
 * GET /api/admin/orders — Sipariş listesi
 */

import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/session";
import { getOrdersForAdmin } from "@/lib/repositories";

export async function GET() {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await getOrdersForAdmin();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[admin/orders GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
