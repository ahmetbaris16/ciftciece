/**
 * Yönetici hesabı aç ya da güncelle (komut satırı): kullanıcı adı, e-posta, şifre.
 *
 *   ADMIN_USERNAME=ece ADMIN_EMAIL=siz@alanadiniz.com ADMIN_PASSWORD=<en az 12 karakter> npm run admin:hesap
 *
 * Bilgisayarda: harbi/"Yonetici Hesabi.bat" bilgileri sorar ve bunu yerel veritabanında çalıştırır.
 * Hostinger'da: SSH ile proje klasöründe aynı komut (DATABASE_URL hPanel'deki ortam değişkeninden gelir) ya da
 * ilk kurulumda `prisma db seed` (docs/YAYIN.md).
 *
 * Kullanıcı adı ya da e-postayla bir yönetici bulunursa bilgileri ve şifresi güncellenir (o hesabın açık oturumları
 * en geç 5 dakikada düşer), bulunmazsa yeni yönetici açılır. Müşteri hesabına dokunulmaz. Şifre ekrana/kayda yazılmaz.
 */

import { existsSync } from "node:fs";
import path from "node:path";

const envFile = path.resolve(__dirname, "..", ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function main() {
  // .env yüklendikten sonra: Prisma istemcisi DATABASE_URL'i oluşturulurken okur
  const { prisma } = await import("../lib/db/prisma");
  const { AdminAccountError, upsertAdminAccount } = await import("../lib/auth/admin-account");
  try {
    if (!process.env.DATABASE_URL) throw new AdminAccountError("DATABASE_URL tanımlı değil (.env ya da ortam değişkeni).");
    const r = await upsertAdminAccount({
      username: process.env.ADMIN_USERNAME ?? "",
      email: process.env.ADMIN_EMAIL ?? "",
      password: process.env.ADMIN_PASSWORD ?? "",
    });
    console.log(
      r.created
        ? `Yönetici hesabı açıldı. Kullanıcı adı: ${r.username} · e-posta: ${r.email}`
        : `Yönetici hesabı güncellendi. Kullanıcı adı: ${r.username} · e-posta: ${r.email} (açık oturumlar en geç 5 dakikada kapanır)`
    );
  } catch (err) {
    process.exitCode = 1;
    console.error(err instanceof AdminAccountError ? `HATA: ${err.message}` : err);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
