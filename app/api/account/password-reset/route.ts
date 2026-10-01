/**
 * POST /api/account/password-reset — "Şifremi unuttum": e-postaya şifre yenileme bağlantısı gönderir.
 *
 * Güvenlik:
 * - Yanıt, hesabın var olup olmadığını ELE VERMEZ (her zaman aynı mesaj); token üretimi ve gönderim
 *   yanıttan sonra (after) yapılır, yanıt süresi de fark etmez.
 * - IP başına 10, e-posta başına 3 istek / 15 dk.
 * - E-posta gönderimi yapılandırılmamışsa (production) açıkça 503 döner — "gönderdik" denmez.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { findUserByEmail } from "@/lib/account/customer.repository";
import { createPasswordResetToken, RESET_TOKEN_TTL_MINUTES } from "@/lib/account/password-reset";
import { emailDelivery, sendEmail, simpleEmailHtml } from "@/lib/email/mailer";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { isSameOrigin } from "@/lib/security/same-origin";
import { ACCOUNT_MESSAGES, PasswordResetRequestSchema, accountFieldErrors } from "@/lib/validation/account";

/** Bağlantının kökü: canlıda sabit adres (Host başlığına güvenilmez); geliştirmede isteğin geldiği adres */
function appOrigin(request: NextRequest): string {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }
  return new URL(request.url).origin;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: ACCOUNT_MESSAGES.generic }, { status: 403 });

  if (emailDelivery() === "none") {
    return NextResponse.json({ error: ACCOUNT_MESSAGES.resetUnavailable, code: "EMAIL_DISABLED" }, { status: 503 });
  }

  const parsed = PasswordResetRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const { fieldErrors, message } = accountFieldErrors(parsed.error);
    return NextResponse.json({ error: message, fieldErrors }, { status: 400 });
  }
  const { email } = parsed.data;

  const ip = clientIp(request.headers);
  if (!rateLimit(`pwreset-ip:${ip}`, 10, 15 * 60_000) || !rateLimit(`pwreset-email:${email}`, 3, 15 * 60_000)) {
    return NextResponse.json({ error: ACCOUNT_MESSAGES.tooMany }, { status: 429 });
  }

  const origin = appOrigin(request);
  after(async () => {
    try {
      const user = await findUserByEmail(email);
      if (!user || user.role !== "CUSTOMER") return; // yanıt aynı; e-posta gitmez
      const token = await createPasswordResetToken(user.id);
      const url = `${origin}/sifre-sifirla?token=${encodeURIComponent(token)}`;
      const name = user.name?.split(" ")[0] || "Merhaba";
      await sendEmail({
        to: user.email,
        subject: "Çiftçi Ece — şifre yenileme bağlantınız",
        text: [
          `${name},`,
          "Çiftçi Ece üyeliğiniz için şifre yenileme isteği aldık. Yeni şifrenizi belirlemek için bu bağlantıyı açın:",
          url,
          `Bağlantı ${RESET_TOKEN_TTL_MINUTES} dakika geçerlidir ve bir kez kullanılabilir.`,
          "Bu isteği siz yapmadıysanız bu e-postayı yok sayın; şifreniz değişmez.",
        ].join("\n\n"),
        html: simpleEmailHtml({
          title: "Şifrenizi yenileyin",
          paragraphs: [
            `${name},`,
            "Çiftçi Ece üyeliğiniz için şifre yenileme isteği aldık. Yeni şifrenizi belirlemek için aşağıdaki düğmeye tıklayın.",
            `Bağlantı ${RESET_TOKEN_TTL_MINUTES} dakika geçerlidir ve bir kez kullanılabilir.`,
          ],
          button: { label: "Yeni şifre belirle", url },
          footer: "Bu isteği siz yapmadıysanız bu e-postayı yok sayın; şifreniz değişmez.",
        }),
      });
    } catch (err) {
      console.error("[/api/account/password-reset] bağlantı gönderilemedi:", err);
    }
  });

  return NextResponse.json({ success: true, message: ACCOUNT_MESSAGES.resetRequested });
}
