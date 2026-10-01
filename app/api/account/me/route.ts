/**
 * GET /api/account/me — giriş yapmış üyenin iletişim bilgileri (ödeme formunu doldurmak için).
 * Giriş yoksa 401. Şifre hash'i vb. asla dönmez.
 */

import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/auth/session";
import { getUserById } from "@/lib/account/customer.repository";
import { splitFullName } from "@/lib/validation/account";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentCustomer();
  if (!session) return NextResponse.json({ error: "Giriş yapılmadı." }, { status: 401 });

  try {
    const user = await getUserById(session.id);
    if (!user) return NextResponse.json({ error: "Giriş yapılmadı." }, { status: 401 });
    const { firstName, lastName } = splitFullName(user.name);
    return NextResponse.json(
      { user: { email: user.email, firstName, lastName, phone: user.phone } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[/api/account/me]", err);
    return NextResponse.json({ error: "Bilgiler alınamadı." }, { status: 503 });
  }
}
