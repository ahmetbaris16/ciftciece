/**
 * "Şifremi unuttum" — tek kullanımlık, süreli şifre yenileme bağlantısı.
 *
 * - Token 32 bayt rastgele (base64url); veritabanında yalnız SHA-256 özeti saklanır.
 * - 60 dakika geçerli, tek kullanımlık; yeni istek eskilerini geçersiz kılar.
 * - Şifre yenilenince users.passwordResetAt güncellenir → önceden açılmış oturumlar kapanır
 *   (lib/auth/auth-options.ts jwt callback'i).
 * DATABASE_URL yoksa (yalnız geliştirme) .mock-data/password-resets.json kullanılır.
 */

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";
import { readMock, updateMock } from "@/lib/data/mock-store";
import { sendEmail } from "@/lib/email/mailer";
import { passwordResetEmail } from "@/lib/email/templates/account";
import { getBusinessInfo } from "@/lib/business/business.repository";
import { setPasswordAfterReset } from "./customer.repository";

export const RESET_TOKEN_TTL_MINUTES = 60;

/** Bağlantının kökü: canlıda sabit adres (Host başlığına güvenilmez); geliştirmede isteğin geldiği adres */
export function resetLinkOrigin(requestUrl: string): string {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }
  return new URL(requestUrl).origin;
}

/**
 * Yeni bağlantı üretip üyenin e-postasına gönderir (önceki bağlantılar geçersiz olur). Bağlantı gizli: kuyruğa
 * (veritabanına) yazılmaz, doğrudan gönderilir. Gönderim hatası çağırana fırlatılır.
 * byStore: bağlantıyı yönetim panelinden mağaza gönderiyor (e-posta metni buna göre).
 */
export async function sendPasswordResetLink(
  user: { id: string; email: string; name: string | null },
  origin: string,
  opts: { byStore?: boolean } = {}
): Promise<void> {
  const token = await createPasswordResetToken(user.id);
  const mail = passwordResetEmail({
    business: await getBusinessInfo(),
    firstName: user.name?.split(" ")[0] || "",
    url: `${origin}/sifre-sifirla?token=${encodeURIComponent(token)}`,
    ttlMinutes: RESET_TOKEN_TTL_MINUTES,
    byStore: opts.byStore,
  });
  await sendEmail({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
}

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

interface MockReset {
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
}
const FILE = "password-resets.json";

/** Yeni bağlantı token'ı üretir (ham token döner; e-postaya bu konur). Kullanıcının eski token'ları silinir. */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000);

  if (!USE_DB) {
    await updateMock<MockReset[], void>(FILE, [], (list) => ({
      next: [
        ...list.filter((r) => r.userId !== userId && new Date(r.expiresAt) > new Date()),
        { userId, tokenHash, expiresAt: expiresAt.toISOString(), usedAt: null },
      ],
      result: undefined,
    }));
    return raw;
  }

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } }),
  ]);
  return raw;
}

/** Bağlantı hâlâ geçerli mi? (sayfa açılırken erken uyarı için; asıl kontrol resetPasswordWithToken'da) */
export async function isResetTokenValid(raw: string): Promise<boolean> {
  if (!raw || raw.length > 200) return false;
  const tokenHash = hashToken(raw);
  if (!USE_DB) {
    const list = await readMock<MockReset[]>(FILE, []);
    const r = list.find((x) => x.tokenHash === tokenHash);
    return !!r && !r.usedAt && new Date(r.expiresAt) > new Date();
  }
  const r = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  return !!r && !r.usedAt && r.expiresAt > new Date();
}

/**
 * Token geçerliyse şifreyi değiştirir ve token'ı kullanılmış sayar (aynı bağlantı ikinci kez çalışmaz).
 * Geçersiz/süresi dolmuş/kullanılmışsa "invalid".
 */
export async function resetPasswordWithToken(raw: string, passwordHash: string): Promise<"ok" | "invalid"> {
  if (!raw || raw.length > 200) return "invalid";
  const tokenHash = hashToken(raw);
  const now = new Date();

  if (!USE_DB) {
    const userId = await updateMock<MockReset[], string | null>(FILE, [], (list) => {
      const i = list.findIndex((x) => x.tokenHash === tokenHash);
      if (i < 0 || list[i].usedAt || new Date(list[i].expiresAt) <= now) return { next: list, result: null };
      const next = list.slice();
      next[i] = { ...next[i], usedAt: now.toISOString() };
      return { next, result: next[i].userId };
    });
    if (!userId) return "invalid";
    await setPasswordAfterReset(userId, passwordHash, now);
    return "ok";
  }

  return prisma.$transaction(async (tx) => {
    // Koşullu işaretleme: aynı bağlantıyla eşzamanlı iki istekten yalnız biri geçer
    const token = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!token) return "invalid" as const;
    const { count } = await tx.passwordResetToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count !== 1) return "invalid" as const;
    await tx.user.update({ where: { id: token.userId }, data: { passwordHash, passwordResetAt: now } });
    await tx.passwordResetToken.deleteMany({ where: { userId: token.userId, id: { not: token.id } } });
    return "ok" as const;
  });
}
