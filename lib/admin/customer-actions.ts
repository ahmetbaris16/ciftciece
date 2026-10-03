/**
 * Müşteri sayfasındaki yönetici işlemleri.
 *
 * Şifre yenileme bağlantısı: üye giriş yapamadığında yönetici, müşterinin "şifremi unuttum" akışındaki bağlantının
 * aynısını üyenin e-postasına gönderir. Yönetici şifreyi görmez ve belirleyemez; bağlantıyı da görmez (yalnız
 * e-postaya gider). Önceki bağlantılar geçersiz olur.
 */

import { getUserById } from "@/lib/account/customer.repository";
import { sendPasswordResetLink } from "@/lib/account/password-reset";
import { emailDelivery, type EmailDelivery } from "@/lib/email/mailer";
import { maskEmail } from "@/lib/email/transport";
import { rateLimit } from "@/lib/security/rate-limit";
import { createAuditLog } from "@/lib/security/audit";
import { AdminActionError } from "./errors";

/** Loglarda kişisel veri olmasın: hata metnindeki e-posta adresleri maskelenir */
const maskEmails = (text: string) => text.replace(/[^\s<>"'(),;:]+@[^\s<>"'(),;:]+/g, (m) => maskEmail(m));

/** mode "dev-outbox": yerel geliştirme — e-posta gönderilmez, .mock-data/outbox.json'a yazılır */
export async function sendResetLinkToCustomer(
  userId: string,
  adminId: string,
  origin: string
): Promise<{ sentTo: string; mode: EmailDelivery }> {
  const user = await getUserById(userId);
  if (!user || user.role !== "CUSTOMER") throw new AdminActionError("Üye hesabı bulunamadı.", 404);
  const mode = emailDelivery();
  if (mode === "none") {
    throw new AdminActionError(
      "E-posta gönderimi ayarlı değil; bağlantı gönderilemez. Önce e-posta ayarlarını tamamlayın (E-postalar sayfası).",
      503
    );
  }
  if (!rateLimit(`admin-pwreset:${user.id}`, 3, 15 * 60_000)) {
    throw new AdminActionError("Bu üyeye kısa süre içinde birkaç bağlantı gönderildi; 15 dakika sonra tekrar deneyin.", 429);
  }
  try {
    await sendPasswordResetLink(user, origin, { byStore: true });
  } catch (err) {
    console.error(`[admin] şifre yenileme bağlantısı gönderilemedi: ${maskEmails(err instanceof Error ? err.message : String(err))}`);
    throw new AdminActionError("E-posta gönderilemedi. E-posta ayarlarını kontrol edip tekrar deneyin.", 502);
  }
  await createAuditLog({ userId: adminId, action: "customer.password_reset_link", entity: "user", entityId: user.id });
  return { sentTo: user.email, mode };
}
