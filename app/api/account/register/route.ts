/**
 * POST /api/account/register — mağaza üyeliği oluşturur (role CUSTOMER).
 * Başarılıysa istemci aynı bilgilerle signIn("customer") çağırıp oturum açar.
 *
 * Güvenlik: şifre bcrypt ile hash'lenir, IP başına saatte 5 kayıt, köken kontrolü.
 */

import { NextRequest, NextResponse } from "next/server";
import { createCustomer, EmailTakenError } from "@/lib/account/customer.repository";
import { hashPassword } from "@/lib/auth/password";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { isSameOrigin } from "@/lib/security/same-origin";
import { ACCOUNT_MESSAGES, RegisterSchema, accountFieldErrors } from "@/lib/validation/account";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: ACCOUNT_MESSAGES.generic }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    const { fieldErrors, message } = accountFieldErrors(parsed.error);
    return NextResponse.json({ error: message, fieldErrors }, { status: 400 });
  }

  if (!rateLimit(`register:${clientIp(request.headers)}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: ACCOUNT_MESSAGES.tooMany }, { status: 429 });
  }

  const { firstName, lastName, email, phone, password } = parsed.data;
  try {
    const user = await createCustomer({
      email,
      name: `${firstName} ${lastName}`,
      phone,
      passwordHash: await hashPassword(password),
    });
    return NextResponse.json({ success: true, user: { email: user.email, name: user.name } }, { status: 201 });
  } catch (err) {
    if (err instanceof EmailTakenError) {
      return NextResponse.json(
        { error: ACCOUNT_MESSAGES.emailTaken, fieldErrors: { email: ACCOUNT_MESSAGES.emailTaken } },
        { status: 409 }
      );
    }
    console.error("[/api/account/register]", err);
    return NextResponse.json({ error: ACCOUNT_MESSAGES.unavailable }, { status: 503 });
  }
}
