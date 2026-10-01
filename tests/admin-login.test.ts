/**
 * Yönetici girişi (Y-04): kaba kuvvete karşı deneme sınırı; müşteri hesabı panele giremez.
 * Testlerde (NODE_ENV production değil) sınırlar 10 kat gevşektir (lib/security/rate-limit.ts):
 * e-posta başına 5 × 10 = 50 deneme.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { authOptions, LOGIN_RATE_LIMITED } from "@/lib/auth/auth-options";
import { setupTestDb } from "./helpers/db";

setupTestDb();

type Authorize = (credentials: Record<string, string>, req: { headers: Record<string, string> }) => Promise<unknown>;
const adminAuthorize = (
  authOptions.providers.find((p) => p.id === "credentials") as unknown as { options: { authorize: Authorize } }
).options.authorize;

const PASSWORD = "Dogru-Sifre-123";

async function createUser(email: string, role: "ADMIN" | "CUSTOMER") {
  // Düşük maliyetli hash: test hızlı kalsın (canlıda maliyet 12)
  await prisma.user.create({ data: { email, name: "Test", role, passwordHash: await hash(PASSWORD, 4) } });
}

const req = (ip: string) => ({ headers: { "x-forwarded-for": ip } });

test("doğru şifreyle yönetici girer; e-posta büyük harfle yazılsa da bulunur; müşteri hesabı giremez", async () => {
  await createUser("yonetici@example.test", "ADMIN");
  await createUser("musteri@example.test", "CUSTOMER");
  const ok = (await adminAuthorize({ email: "Yonetici@Example.test", password: PASSWORD }, req("203.0.113.1"))) as { role: string } | null;
  assert.equal(ok?.role, "ADMIN");
  assert.equal(await adminAuthorize({ email: "yonetici@example.test", password: "yanlis" }, req("203.0.113.1")), null);
  assert.equal(await adminAuthorize({ email: "musteri@example.test", password: PASSWORD }, req("203.0.113.1")), null);
  assert.equal(await adminAuthorize({ email: "olmayan@example.test", password: PASSWORD }, req("203.0.113.1")), null);
});

test("aynı e-postaya çok deneme: sınır aşılınca doğru şifreyle bile girilemez", async () => {
  await createUser("hedef@example.test", "ADMIN");
  // Farklı IP'lerden (IP sınırına takılmadan) aynı hesaba 50 yanlış deneme
  for (let i = 0; i < 50; i++) {
    assert.equal(await adminAuthorize({ email: "hedef@example.test", password: `yanlis-${i}` }, req(`198.51.100.${i}`)), null);
  }
  await assert.rejects(
    adminAuthorize({ email: "hedef@example.test", password: PASSWORD }, req("198.51.100.200")),
    (err: unknown) => err instanceof Error && err.message === LOGIN_RATE_LIMITED
  );
});

test("aynı IP'den çok deneme: farklı e-postalarla da sınıra takılır", async () => {
  for (let i = 0; i < 100; i++) {
    await adminAuthorize({ email: `deneme-${i}@example.test`, password: "yanlis" }, req("192.0.2.7"));
  }
  await assert.rejects(
    adminAuthorize({ email: "baska@example.test", password: "yanlis" }, req("192.0.2.7")),
    (err: unknown) => err instanceof Error && err.message === LOGIN_RATE_LIMITED
  );
});
