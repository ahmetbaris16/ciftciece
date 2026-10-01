/**
 * POST /api/account/password-reset/confirm — bağlantıdaki token + yeni şifre.
 * Token tek kullanımlık ve 60 dk geçerli; başarılıysa önceki oturumlar kapanır.
 */

import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { resetPasswordWithToken } from "@/lib/account/password-reset";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { isSameOrigin } from "@/lib/security/same-origin";
import { ACCOUNT_MESSAGES, PasswordResetSchema, accountFieldErrors } from "@/lib/validation/account";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: ACCOUNT_MESSAGES.generic }, { status: 403 });

  if (!rateLimit(`pwreset-confirm:${clientIp(request.headers)}`, 20, 15 * 60_000)) {
    return NextResponse.json({ error: ACCOUNT_MESSAGES.tooMany }, { status: 429 });
  }

  const parsed = PasswordResetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const { fieldErrors, message } = accountFieldErrors(parsed.error);
    return NextResponse.json({ error: message, fieldErrors }, { status: 400 });
  }

  try {
    const result = await resetPasswordWithToken(parsed.data.token, await hashPassword(parsed.data.newPassword));
    if (result === "invalid") {
      return NextResponse.json({ error: ACCOUNT_MESSAGES.resetLinkInvalid, code: "INVALID_TOKEN" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/account/password-reset/confirm]", err);
    return NextResponse.json({ error: ACCOUNT_MESSAGES.unavailable }, { status: 503 });
  }
}
