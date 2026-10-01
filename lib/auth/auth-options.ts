/**
 * Çiftçi Ece — NextAuth Configuration
 *
 * İki ayrı credentials sağlayıcısı, tek JWT oturumu:
 * - "credentials" → yönetim paneli (/admin/giris). Yalnız ADMIN ve STAFF. Oturum 8 saat.
 * - "customer"    → mağaza üyeleri (/giris, /uye-ol). Yalnız CUSTOMER. Oturum 30 gün.
 * Müşteri hesabıyla panele, yönetici hesabıyla mağaza girişine izin verilmez (roller karışmaz).
 * Session'da user id, rol ve ad taşınır.
 */

import type { NextAuthOptions, Session } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db/prisma";
import { findUserByEmail, getUserById } from "@/lib/account/customer.repository";
import { verifyPassword } from "@/lib/auth/password";
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
/** Müşteri oturumunun hâlâ geçerli olduğu (şifre sıfırlanmadı, hesap duruyor) bu aralıkla yeniden denetlenir */
const CUSTOMER_RECHECK_SECONDS = 5 * 60;

/** Müşteri girişinde hız sınırı aşılınca signIn() bu kodu `error` olarak döndürür */
export const LOGIN_RATE_LIMITED = "RATE_LIMITED";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Yönetici",
      credentials: {
        email: { label: "E-posta", type: "email" },
        password: { label: "Şifre", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Development mock (DB yokken). .env'deki ADMIN_EMAIL henüz "TODO" ise varsayılan kullanılır
        // (giriş formu e-posta biçimi ister; "TODO" ile form hiç gönderilemiyordu).
        if (!USE_DB) {
          const envEmail = process.env.ADMIN_EMAIL?.trim();
          const mockEmail = envEmail && envEmail !== "TODO" ? envEmail : "admin@ciftciece.com";
          const mockPassword = process.env.ADMIN_PASSWORD || "Admin123!";
          if (
            credentials.email === mockEmail &&
            credentials.password === mockPassword
          ) {
            return {
              id: MOCK_ADMIN.id,
              email: MOCK_ADMIN.email,
              name: MOCK_ADMIN.name,
              role: MOCK_ADMIN.role,
            };
          }
          return null;
        }

        // Production — Prisma
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.passwordHash) {
          return null;
        }

        const isValid = await verifyPassword(credentials.password, user.passwordHash);
        if (!isValid) {
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
        // Hesap yoksa da şifre karşılaştırması yapılır (yanıt süresi hesabın varlığını ele vermesin)
        const valid = await verifyPassword(password, user?.passwordHash);
        if (!user || !valid || user.role !== "CUSTOMER") return null;

        return { id: user.id, email: user.email, name: user.name, role: "CUSTOMER" };
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

      // Profilde ad değişince istemci useSession().update({ name }) çağırır
      if (trigger === "update" && token.role === "CUSTOMER") {
        const name = (session as { name?: unknown } | undefined)?.name;
        if (typeof name === "string" && name.trim()) token.name = name.trim().slice(0, 120);
      }

      // "Şifremi unuttum" ile şifre yenilendiyse ondan önce açılmış müşteri oturumları kapanır
      // (her istekte değil, 5 dakikada bir denetlenir; veritabanı geçici yanıt vermezse oturum düşürülmez).
      if (token.role === "CUSTOMER" && typeof token.id === "string") {
        const now = Math.floor(Date.now() / 1000);
        const checkedAt = typeof token.checkedAt === "number" ? token.checkedAt : 0;
        if (now - checkedAt > CUSTOMER_RECHECK_SECONDS) {
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
