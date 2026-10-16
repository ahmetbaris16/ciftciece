/**
 * Mağaza ve yönetim paneli oturumları ayrı çerezlerde durur: aynı tarayıcıda panel açıkken mağazada üye girişi
 * yapmak panel oturumunu düşürmez, yönetici girişi de üyenin oturumunu ezmez (ikisi tek çerezi paylaşıyordu).
 * Gerçek NextAuth uçları (GET/POST işleyicileri) çağrılır; çerezler tarayıcı gibi bir çerez kavanozunda tutulur.
 */

import { before, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import type { AuthOptions } from "next-auth";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { setupTestDb } from "./helpers/db";

setupTestDb();

// NextAuth çekirdeği paket dışa aktarımlarında yok; dosya yoluyla yüklenir (uç işleyicileri `cookies()` istediği için
// istek bağlamı dışında çağrılamaz, çekirdek aynı işi saf işlevle yapar)
const { AuthHandler } = createRequire(path.join(process.cwd(), "noop.js"))(path.join(process.cwd(), "node_modules/next-auth/core/index.js")) as {
  AuthHandler: (p: { req: Record<string, unknown>; options: unknown }) => Promise<{ body?: unknown; cookies?: unknown }>;
};

const ORIGIN = "http://localhost:3000";
const PASSWORD = "Dogru-Sifre-123";

let authOptions: AuthOptions;
let adminAuthOptions: AuthOptions;

before(async () => {
  // Gizli anahtar ve adres modüller yüklenmeden önce tanımlanır (seçenekler yüklenirken okunur)
  process.env.NEXTAUTH_SECRET = "oturum-testi-gizli-anahtar-en-az-32-karakter";
  process.env.NEXTAUTH_URL = ORIGIN;
  ({ authOptions, adminAuthOptions } = await import("@/lib/auth/auth-options"));
});

/** Tarayıcı çerez kavanozu */
class Jar {
  private cookies = new Map<string, string>();
  pick(only?: string[]): Record<string, string> {
    return Object.fromEntries([...this.cookies].filter(([k]) => !only || only.includes(k)));
  }
  names(): string[] {
    return [...this.cookies.keys()];
  }
  set(name: string, value: string) {
    this.cookies.set(name, value);
  }
  absorb(cookies: Array<{ name: string; value: string; options?: { maxAge?: number } }> | undefined) {
    for (const c of cookies ?? []) {
      if (c.value === "" || c.options?.maxAge === 0) this.cookies.delete(c.name);
      else this.cookies.set(c.name, c.value);
    }
  }
}

/** Gerçek NextAuth çekirdeği, gerçek seçeneklerle: /api/auth ve /api/admin-auth uçlarının yaptığı iş */
async function call(options: AuthOptions, method: "GET" | "POST", action: string, jar: Jar, opts: { providerId?: string; body?: Record<string, string>; only?: string[] } = {}) {
  const res = await AuthHandler({
    req: {
      host: ORIGIN,
      method,
      action: action as never,
      providerId: opts.providerId,
      body: opts.body,
      query: {},
      cookies: jar.pick(opts.only),
      headers: { origin: ORIGIN, "x-forwarded-for": "203.0.113.50" },
    },
    options,
  });
  jar.absorb(res.cookies as never);
  return res;
}

async function login(options: AuthOptions, provider: string, fields: Record<string, string>, jar: Jar) {
  const csrf = (await call(options, "GET", "csrf", jar)).body as { csrfToken: string };
  return call(options, "POST", "callback", jar, { providerId: provider, body: { csrfToken: csrf.csrfToken, json: "true", callbackUrl: ORIGIN, ...fields } });
}

async function sessionOf(options: AuthOptions, jar: Jar, only?: string[]) {
  const res = await call(options, "GET", "session", jar, { only });
  const data = res.body as { user?: { role?: string } } | null;
  return data?.user ?? null;
}

async function seedUsers() {
  const passwordHash = await hash(PASSWORD, 4);
  await prisma.user.create({ data: { email: "yonetici@example.test", name: "Yönetici", role: "ADMIN", username: "yonetici", passwordHash } });
  await prisma.user.create({ data: { email: "musteri@example.test", name: "Müşteri", role: "CUSTOMER", passwordHash } });
}

test("çerez adları ayrı; mağaza çerezinin adı eskisiyle aynı (açık üye oturumları sürer)", () => {
  assert.equal(authOptions.cookies, undefined, "mağaza NextAuth'un varsayılan çerez adını kullanır: next-auth.session-token");
  assert.equal(adminAuthOptions.cookies?.sessionToken?.name, "ce-admin.session-token");
  assert.notEqual(adminAuthOptions.cookies?.csrfToken?.name, "next-auth.csrf-token");
  assert.deepEqual((authOptions.providers as unknown as Array<{ id: string; options: { id?: string } }>).map((p) => p.options.id ?? p.id), ["customer"]);
  assert.deepEqual((adminAuthOptions.providers as unknown as Array<{ id: string }>).map((p) => p.id), ["credentials"]);
  assert.equal(adminAuthOptions.session?.maxAge, 8 * 60 * 60);
  assert.equal(authOptions.session?.maxAge, 30 * 24 * 60 * 60);
});

test("aynı tarayıcıda panel ve mağaza oturumu birlikte durur; biri ötekini ezmez", async () => {
  await seedUsers();
  const jar = new Jar();

  // Yönetici panele girer
  await login(adminAuthOptions, "credentials", { login: "yonetici", password: PASSWORD }, jar);
  assert.ok(jar.names().includes("ce-admin.session-token"), "panel çerezi yazıldı");
  assert.equal((await sessionOf(adminAuthOptions, jar))?.role, "ADMIN");

  // Aynı tarayıcıda müşteri mağazaya girer (eskiden panel oturumunu düşürürdü)
  await login(authOptions, "customer", { email: "musteri@example.test", password: PASSWORD }, jar);
  assert.ok(jar.names().includes("next-auth.session-token"), "mağaza çerezi yazıldı");
  assert.ok(jar.names().includes("ce-admin.session-token"), "panel çerezi hâlâ duruyor");

  assert.equal((await sessionOf(authOptions, jar))?.role, "CUSTOMER", "mağazada müşteri");
  assert.equal((await sessionOf(adminAuthOptions, jar))?.role, "ADMIN", "panelde yönetici");
});

test("mağaza oturumu panele geçmez; panel oturumu mağazada müşteri sayılmaz", async () => {
  await seedUsers();
  const jar = new Jar();
  await login(authOptions, "customer", { email: "musteri@example.test", password: PASSWORD }, jar);
  await login(adminAuthOptions, "credentials", { login: "yonetici", password: PASSWORD }, jar);

  assert.equal(await sessionOf(adminAuthOptions, jar, ["next-auth.session-token"]), null, "yalnız mağaza çerezi: panel oturumu yok");
  assert.equal(await sessionOf(authOptions, jar, ["ce-admin.session-token"]), null, "yalnız panel çerezi: mağaza oturumu yok");
});

test("yönetici mağazaya kendi hesabıyla girebilir ama bu oturum panele geçmez", async () => {
  await seedUsers();
  const jar = new Jar();
  await login(authOptions, "customer", { email: "yonetici@example.test", password: PASSWORD }, jar);
  assert.equal((await sessionOf(authOptions, jar))?.role, "ADMIN", "mağazada yönetici hesabı (alışveriş)");
  assert.equal(await sessionOf(adminAuthOptions, jar), null, "panel için ayrıca panel girişi gerekir");

  // Mağaza jetonu panel çerez adıyla gönderilse de (kapsam "shop") panel kabul etmez
  const forged = new Jar();
  forged.set("ce-admin.session-token", jar.pick(["next-auth.session-token"])["next-auth.session-token"]);
  assert.equal(await sessionOf(adminAuthOptions, forged), null);
});

test("müşteri hesabıyla panel girişi olmaz", async () => {
  await seedUsers();
  const jar = new Jar();
  await login(adminAuthOptions, "credentials", { login: "musteri@example.test", password: PASSWORD }, jar);
  assert.ok(!jar.names().includes("ce-admin.session-token"));
  assert.equal(await sessionOf(adminAuthOptions, jar), null);
});

test("eski mağaza jetonu (kapsam alanı yok) mağazada geçerli kalır: açık üye oturumları düşmez", async () => {
  const session = authOptions.callbacks!.session!;
  const legacy = { id: "u1", role: "CUSTOMER" };
  const out = (await session({ session: { user: { name: "A" }, expires: "" }, token: legacy } as never)) as { user?: { role?: string } };
  assert.equal(out.user?.role, "CUSTOMER");
  // Panel ise kapsamsız jetonu reddeder
  const denied = (await adminAuthOptions.callbacks!.session!({ session: { user: { name: "A" }, expires: "" }, token: { id: "u1", role: "ADMIN" } } as never)) as { user?: unknown };
  assert.equal(denied.user, undefined);
});
