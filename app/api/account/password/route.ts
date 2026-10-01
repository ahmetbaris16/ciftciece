/**
 * POST /api/account/password — mevcut şifreyi doğrulayıp yenisini kaydeder.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/auth/session";
import { getUserById, updateUserPasswordHash } from "@/lib/account/customer.repository";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { rateLimit } from "@/lib/security/rate-limit";
import { isSameOrigin } from "@/lib/security/same-origin";
import { ACCOUNT_MESSAGES, PasswordChangeSchema, accountFieldErrors } from "@/lib/validation/account";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: ACCOUNT_MESSAGES.generic }, { status: 403 });
  }
  const session = await getCurrentCustomer();
  if (!session) return NextResponse.json({ error: "Oturumunuz kapanmış. Lütfen tekrar giriş yapın." }, { status: 401 });

  const parsed = PasswordChangeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const { fieldErrors, message } = accountFieldErrors(parsed.error);
    return NextResponse.json({ error: message, fieldErrors }, { status: 400 });
  }

  if (!rateLimit(`password:${session.id}`, 8, 15 * 60_000)) {
    return NextResponse.json({ error: ACCOUNT_MESSAGES.tooMany }, { status: 429 });
  }

  try {
    const user = await getUserById(session.id);
    if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
      return NextResponse.json(
        { error: ACCOUNT_MESSAGES.wrongPassword, fieldErrors: { currentPassword: ACCOUNT_MESSAGES.wrongPassword } },
        { status: 400 }
      );
    }
    await updateUserPasswordHash(user.id, await hashPassword(parsed.data.newPassword));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/account/password]", err);
    return NextResponse.json({ error: ACCOUNT_MESSAGES.unavailable }, { status: 503 });
  }
}
