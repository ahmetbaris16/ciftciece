/**
 * PATCH /api/account/profile — üyenin adı ve telefonu. E-posta değiştirilemez (giriş kimliği).
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/auth/session";
import { updateCustomerProfile } from "@/lib/account/customer.repository";
import { isSameOrigin } from "@/lib/security/same-origin";
import { ACCOUNT_MESSAGES, ProfileSchema, accountFieldErrors } from "@/lib/validation/account";

export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: ACCOUNT_MESSAGES.generic }, { status: 403 });
  }
  const session = await getCurrentCustomer();
  if (!session) return NextResponse.json({ error: "Oturumunuz kapanmış. Lütfen tekrar giriş yapın." }, { status: 401 });

  const parsed = ProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const { fieldErrors, message } = accountFieldErrors(parsed.error);
    return NextResponse.json({ error: message, fieldErrors }, { status: 400 });
  }

  const name = `${parsed.data.firstName} ${parsed.data.lastName}`;
  try {
    const user = await updateCustomerProfile(session.id, { name, phone: parsed.data.phone });
    if (!user) return NextResponse.json({ error: "Hesap bulunamadı." }, { status: 404 });
    return NextResponse.json({ success: true, user: { name: user.name, phone: user.phone } });
  } catch (err) {
    console.error("[/api/account/profile]", err);
    return NextResponse.json({ error: ACCOUNT_MESSAGES.unavailable }, { status: 503 });
  }
}
