/**
 * PATCH /api/admin/account — giriş yapmış yöneticinin kullanıcı adı, e-posta ve şifresi.
 * Mevcut şifre doğrulanmadan hiçbir şey değişmez. Şifre değişince diğer oturumlar en geç 5 dakikada düşer;
 * istemci yeniden giriş ister. Kurallar: lib/auth/admin-account.ts.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { adminAction, AdminActionError } from "@/lib/admin/api";
import { AdminAccountError, updateAdminAccount } from "@/lib/auth/admin-account";
import { createAuditLog } from "@/lib/security/audit";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

const Schema = z.object({
  currentPassword: z.string({ error: "Mevcut şifrenizi yazın." }).min(1, { error: "Mevcut şifrenizi yazın." }).max(200),
  username: z.string({ error: "Kullanıcı adı yazın." }).max(60),
  email: z.string({ error: "E-posta yazın." }).max(254),
  newPassword: z.string().max(200).optional(),
});

export async function PATCH(request: NextRequest) {
  return adminAction(request, Schema, async (input, user) => {
    // Mevcut şifre denemesine sınır (oturumu ele geçiren biri şifreyi deneme yanılmayla bulamasın)
    if (!rateLimit(`admin-account:${user.id}:${clientIp(request.headers)}`, 10, 15 * 60_000)) {
      throw new AdminActionError("Çok fazla deneme yapıldı. 15 dakika sonra tekrar deneyin.", 429);
    }
    try {
      const result = await updateAdminAccount(user.id, {
        currentPassword: input.currentPassword,
        username: input.username,
        email: input.email,
        newPassword: input.newPassword?.trim() ? input.newPassword : undefined,
      });
      await createAuditLog({
        userId: user.id,
        action: "admin.account.update",
        entity: "user",
        entityId: user.id,
        details: { username: result.username, passwordChanged: result.passwordChanged },
        ipAddress: clientIp(request.headers),
      });
      return result;
    } catch (err) {
      if (err instanceof AdminAccountError) throw new AdminActionError(err.message, err.status);
      throw err;
    }
  });
}
