/**
 * Çiftçi Ece — NextAuth Configuration
 *
 * İki ayrı credentials sağlayıcısı, tek JWT oturumu:
 * - "credentials" → yönetim paneli (/admin/giris): kullanıcı adı (ya da e-posta) + şifre. Yalnız ADMIN ve STAFF.
 *                   Oturum 8 saat.
 * - "customer"    → mağaza girişi (/giris, /uye-ol). Üye müşteri oturumu 30 gün. Yönetici/personel de mağazaya kendi
 *                   e-posta ve şifresiyle girebilir (tek hesap: aynı oturum panelde de geçerlidir, 8 saatte düşer);
 *                   bu hesaplara yönetici girişinin deneme sınırı uygulanır.
 * Müşteri hesabıyla panele girilemez.
 * Şifre değişince (müşteri: "şifremi unuttum", yönetici: panel → Ayarlar → Yönetici hesabı) önceki oturumlar en geç
 * 5 dakikada düşer. Session'da user id, rol ve ad taşınır.
 */

import type { NextAuthOptions, Session } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db/prisma";
import { findUserByEmail, getUserById } from "@/lib/account/customer.repository";
import { verifyPassword } from "@/lib/auth/password";
import { adminLoginLookup } from "@/lib/auth/admin-account";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { normalizeEmail } from "@/lib/validation/account";

// Mock admin for development without DB
const MOCK_ADMIN = {
  id: "mock-admin-id",
  email: "admin@ciftciece.com",
  name: "Admin",
  role: "ADMIN" as const,
  passwordHash: "", // Will be set on first check
};

const USE_DB = !!process.env.DATABASE_URL;

const ADMIN_SESSION_SECONDS = 8 * 60 * 60; // 8 saat
const CUSTOMER_SESSION_SECONDS = 30 * 24 * 60 * 60; // 30 gün
/** Oturumun hâlâ geçerli olduğu (şifre değişmedi, hesap duruyor) bu aralıkla yeniden denetlenir */
const ACCOUNT_RECHECK_SECONDS = 5 * 60;

/** Müşteri girişinde hız sınırı aşılınca signIn() bu kodu `error` olarak döndürür */
export const LOGIN_RATE_LIMITED = "RATE_LIMITED";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Yönetici",
      credentials: {
        login: { label: "Kullanıcı adı veya e-posta", type: "text" },
        password: { label: "Şifre", type: "password" },
      },
      async authorize(credentials, req) {
        // "email" alanı eski giriş formundan (bu sürümden önce) gelir
        const c = (credentials ?? {}) as Record<string, string | undefined>;
        const login = (c.login ?? c.email ?? "").trim();
        const password = c.password ?? "";
        if (!login || login.length > 254 || !password || password.length > 200) {
          return null;
        }

        // Kaba kuvvete karşı (Y-04): IP başına 10, hesap (kullanıcı adı/e-posta) başına 5 deneme / 15 dk — müşteri
        // girişinden sıkı. Sınır her denemede sayılır (başarılı giriş dahil); aşılınca şifreye bakılmaz.
        const ip = clientIp(req?.headers);
        const lookup = adminLoginLookup(login);
        const loginKey = "email" in lookup ? lookup.email : lookup.username;
        if (!rateLimit(`admin-login-ip:${ip}`, 10, 15 * 60_000) || !rateLimit(`admin-login-id:${loginKey}`, 5, 15 * 60_000)) {
          throw new Error(LOGIN_RATE_LIMITED);
        }

        // Development mock (DB yokken): kullanıcı adı "admin" ya da varsayılan e-posta. .env'deki ADMIN_EMAIL
        // henüz "TODO" ise varsayılan e-posta kullanılır.
        if (!USE_DB) {
          const envEmail = process.env.ADMIN_EMAIL?.trim();
          const mockEmail = normalizeEmail(envEmail && envEmail !== "TODO" ? envEmail : "admin@ciftciece.com");
          const mockPassword = process.env.ADMIN_PASSWORD || "Admin123!";
          if ((loginKey === mockEmail || loginKey === "admin") && password === mockPassword) {
            return {
              id: MOCK_ADMIN.id,
              email: MOCK_ADMIN.email,
              name: MOCK_ADMIN.name,
              role: MOCK_ADMIN.role,
            };
          }
          return null;
        }

        // Production — Prisma (kullanıcı adı ya da e-posta; ikisi de tekil)
        const user = await prisma.user.findUnique({ where: lookup });

        // Hesap yoksa da şifre karşılaştırması yapılır (yanıt süresi yönetici hesabının varlığını ele vermesin)
        const isValid = await verifyPassword(password, user?.passwordHash);
        if (!user || !isValid) {
          return null;
        }

        // Sadece ADMIN ve STAFF giriş yapabilir
        if (user.role !== "ADMIN" && user.role !== "STAFF") {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
    CredentialsProvider({
      id: "customer",
      name: "Üye",
      credentials: {
        email: { label: "E-posta", type: "email" },
        password: { label: "Şifre", type: "password" },
      },
      async authorize(credentials, req) {
        const email = normalizeEmail(credentials?.email ?? "");
        const password = credentials?.password ?? "";
        if (!email || !password || password.length > 200) return null;

        // Kaba kuvvete karşı: IP başına 20, e-posta başına 8 deneme / 15 dk
        const ip = clientIp(req?.headers);
        if (!rateLimit(`login-ip:${ip}`, 20, 15 * 60_000) || !rateLimit(`login-email:${email}`, 8, 15 * 60_000)) {
          throw new Error(LOGIN_RATE_LIMITED);
        }

        const user = await findUserByEmail(email);
        // Yönetici/personel hesabı: panel girişindeki hesap başına sınır (aynı sayaç) burada da geçerli; mağaza
        // formu yönetici şifresini denemek için daha gevşek bir kapı olmasın
        if (user && user.role !== "CUSTOMER" && !rateLimit(`admin-login-id:${email}`, 5, 15 * 60_000)) {
          throw new Error(LOGIN_RATE_LIMITED);
        }
        // Hesap yoksa da şifre karşılaştırması yapılır (yanıt süresi hesabın varlığını ele vermesin)
        const valid = await verifyPassword(password, user?.passwordHash);
        if (!user || !valid) return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as unknown as { role: string }).role;
        token.authAt = Math.floor(Date.now() / 1000);
        token.checkedAt = token.authAt;
      }

      // Profilde ad değişince istemci useSession().update({ name }) çağırır (mağaza hesabı: üye ya da yönetici)
      if (trigger === "update" && typeof token.role === "string") {
        const name = (session as { name?: unknown } | undefined)?.name;
        if (typeof name === "string" && name.trim()) token.name = name.trim().slice(0, 120);
      }

      // Şifre yenilendiyse (müşteri: "şifremi unuttum", yönetici: panelden) ondan önce açılmış oturumlar kapanır
      // (her istekte değil, 5 dakikada bir denetlenir; veritabanı geçici yanıt vermezse oturum düşürülmez).
      // Veritabanısız geliştirme kipindeki örnek yönetici hesabı denetlenmez.
      const recheck = token.role === "CUSTOMER" || ((token.role === "ADMIN" || token.role === "STAFF") && token.id !== MOCK_ADMIN.id);
      if (recheck && typeof token.id === "string") {
        const now = Math.floor(Date.now() / 1000);
        const checkedAt = typeof token.checkedAt === "number" ? token.checkedAt : 0;
        if (now - checkedAt > ACCOUNT_RECHECK_SECONDS) {
          const account = await getUserById(token.id).catch((err) => {
            console.error("[auth] Oturum denetimi yapılamadı:", err);
            return undefined;
          });
          if (account === null) return {}; // hesap silinmiş
          if (account) {
            const authAt = typeof token.authAt === "number" ? token.authAt : 0;
            if (account.passwordResetAt && account.passwordResetAt.getTime() / 1000 > authAt) return {};
            token.checkedAt = now;
          }
        }
      }

      // Yönetici oturumu 8 saatte düşer (çerez ömrü müşteriler için 30 gün olduğu için ayrıca kontrol edilir).
      // authAt'i olmayan eski yönetici oturumları da yeniden giriş ister.
      if (token.role === "ADMIN" || token.role === "STAFF") {
        const authAt = typeof token.authAt === "number" ? token.authAt : 0;
        if (Math.floor(Date.now() / 1000) - authAt > ADMIN_SESSION_SECONDS) return {};
      }
      return token;
    },
    async session({ session, token }) {
      // Boş oturum nesnesi = oturum yok (getServerSession null döner, useSession "unauthenticated")
      if (!token.id || !token.role) return {} as Session;
      if (session.user) {
        (session.user as { id: string }).id = token.id as string;
        (session.user as { role: string }).role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/admin/giris",
    error: "/admin/giris",
  },
  session: {
    strategy: "jwt",
    maxAge: CUSTOMER_SESSION_SECONDS,
  },
  secret: process.env.NEXTAUTH_SECRET,
};
