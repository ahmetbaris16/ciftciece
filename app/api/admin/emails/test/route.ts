/**
 * POST /api/admin/emails/test { to } — e-posta ayarlarını denemek için doğrudan (kuyruksuz) bir e-posta
 * gönderir; sonucu hemen döndürür. Sonuç paneldeki e-posta durumuna yazılır (lib/email/health.ts): şifre ya da
 * bağlantı hatasında ne yapılacağı o kutuda, burada kısa sonuç; diğer hatalarda Türkçe açıklama. Sunucunun cevabı
 * ayrıntı olarak eklenir (şifre içermez).
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminAction, AdminActionError } from "@/lib/admin/api";
import { getBusinessInfo } from "@/lib/business/business.repository";
import { testEmail } from "@/lib/email/templates/account";
import { replyToFor } from "@/lib/email/brand";
import { smtpConfigFromEnv } from "@/lib/email/config";
import { explainSmtpError } from "@/lib/email/errors";
import { recordSmtpFailure, recordSmtpSuccess } from "@/lib/email/health";
import {
  deliver,
  EmailNotConfiguredError,
  maskEmail,
  SmtpAuthError,
  SmtpConnectionError,
} from "@/lib/email/transport";
import { createAuditLog } from "@/lib/security/audit";
import { USE_DB } from "@/lib/data/source";

const Schema = z.object({
  to: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email({ error: "E-posta adresini kontrol edin." })),
});

const logStateError = (e: unknown) => console.error("[email] durum yazılamadı:", e);

export async function POST(request: NextRequest) {
  return adminAction(request, Schema, async (input, user) => {
    const business = await getBusinessInfo();
    const mail = testEmail({ business, sentBy: user.email ?? "yönetim paneli" });
    const cfg = smtpConfigFromEnv();
    try {
      const result = await deliver({ to: input.to, subject: mail.subject, html: mail.html, text: mail.text, replyTo: replyToFor(business) });
      if (cfg && result.mode === "smtp") await recordSmtpSuccess(cfg).catch(logStateError);
      await createAuditLog({ userId: user.id, action: "email.test", entity: "email", entityId: null, details: { to: maskEmail(input.to) } });
      return { mode: result.mode };
    } catch (err) {
      if (err instanceof EmailNotConfiguredError) {
        throw new AdminActionError("E-posta gönderimi henüz ayarlı değil; hosting'de e-posta (SMTP) bilgileri girilince çalışır.", 503);
      }
      const message = err instanceof Error ? err.message : String(err);
      const detail = `(Sunucunun cevabı: ${message.slice(0, 200)})`;
      // Ayar sorunu: durum kutusuna yazılır, ne yapılacağı orada (sayfa yenilenir); burada kısa sonuç
      if (cfg && (err instanceof SmtpAuthError || err instanceof SmtpConnectionError)) {
        const auth = err instanceof SmtpAuthError;
        // Veritabanısız deneme kipinde durum kutusu yok: açıklama burada
        const recorded =
          USE_DB &&
          (await recordSmtpFailure(cfg, auth ? "auth" : "connection", message).then(
            () => true,
            (e) => (logStateError(e), false)
          ));
        if (recorded) {
          throw new AdminActionError(
            `Gönderilemedi: ${auth ? "e-posta hesabı şifreyi kabul etmedi" : "e-posta sunucusuna bağlanılamadı"}. Ne yapmanız gerektiği yukarıdaki kutuda yazıyor. ${detail}`,
            502
          );
        }
      }
      const explanation = cfg
        ? explainSmtpError(message, { host: cfg.host, port: cfg.port, user: cfg.user, production: process.env.NODE_ENV === "production" })
        : "E-posta gönderilemedi.";
      throw new AdminActionError(`Gönderilemedi. ${explanation} ${detail}`, 502);
    }
  });
}
