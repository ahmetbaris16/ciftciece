/**
 * POST /api/admin/emails/test { to } — e-posta ayarlarını denemek için doğrudan (kuyruksuz) bir e-posta
 * gönderir; sonucu hemen döndürür (SMTP hatası olduğu gibi gösterilir, şifre içermez).
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminAction, AdminActionError } from "@/lib/admin/api";
import { getBusinessInfo } from "@/lib/business/business.repository";
import { testEmail } from "@/lib/email/templates/account";
import { replyToFor } from "@/lib/email/brand";
import { deliver, EmailNotConfiguredError, maskEmail } from "@/lib/email/transport";
import { createAuditLog } from "@/lib/security/audit";

const Schema = z.object({
  to: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email({ error: "E-posta adresini kontrol edin." })),
});

export async function POST(request: NextRequest) {
  return adminAction(request, Schema, async (input, user) => {
    const business = await getBusinessInfo();
    const mail = testEmail({ business, sentBy: user.email ?? "yönetim paneli" });
    try {
      const result = await deliver({ to: input.to, subject: mail.subject, html: mail.html, text: mail.text, replyTo: replyToFor(business) });
      await createAuditLog({ userId: user.id, action: "email.test", entity: "email", entityId: null, details: { to: maskEmail(input.to) } });
      return { mode: result.mode };
    } catch (err) {
      if (err instanceof EmailNotConfiguredError) {
        throw new AdminActionError("E-posta gönderimi ayarlı değil (SMTP_HOST, SMTP_USER, SMTP_PASS ortam değişkenleri).", 503);
      }
      throw new AdminActionError(`Gönderilemedi: ${err instanceof Error ? err.message : String(err)}`, 502);
    }
  });
}
