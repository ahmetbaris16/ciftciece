/**
 * Mağaza girişi ("customer" sağlayıcısı): üye müşteri girer; yönetici de mağazaya kendi e-posta ve şifresiyle girer
 * (tek hesap, oturum rolü ADMIN kalır). Yönetici hesabına mağaza formundan da panelin hesap başına deneme sınırı
 * uygulanır (aynı sayaç). Testlerde sınırlar 10 kat gevşektir: hesap başına 5 × 10 = 50 deneme.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { authOptions, LOGIN_RATE_LIMITED } from "@/lib/auth/auth-options";
import { isStaffRole, isStoreRole } from "@/lib/auth/roles";
import { setupTestDb } from "./helpers/db";

setupTestDb();

type Authorize = (credentials: Record<string, string>, req: { headers: Record<string, string> }) => Promise<unknown>;
type ProviderShape = { id: string; options: { id?: string; authorize: Authorize } };
// CredentialsProvider'ın kendi id'si hep "credentials"; verilen id options.id'de durur (NextAuth çalışırken birleştirir)
const authorizeOf = (id: string) =>
  (authOptions.providers as unknown as ProviderShape[]).find((p) => (p.options.id ?? p.id) === id)!.options.authorize;
const storeAuthorize = authorizeOf("customer");
const adminAuthorize = authorizeOf("credentials");

const PASSWORD = "Dogru-Sifre-123";
const req = (ip: string) => ({ headers: { "x-forwarded-for": ip } });

async function createUser(email: string, role: "ADMIN" | "STAFF" | "CUSTOMER") {
  await prisma.user.create({ data: { email, name: "Test Kişi", role, passwordHash: await hash(PASSWORD, 4) } });
}

test("üye müşteri ve yönetici mağazaya kendi şifresiyle girer; yanlış şifre ve olmayan hesap reddedilir", async () => {
  await createUser("musteri@example.test", "CUSTOMER");
  await createUser("sahip@example.test", "ADMIN");

  const customer = (await storeAuthorize({ email: "Musteri@Example.test", password: PASSWORD }, req("203.0.113.20"))) as { role: string } | null;
  assert.equal(customer?.role, "CUSTOMER");

  // Önceden "e-posta veya şifre hatalı" diyordu: yönetici hesabı mağazada da geçerli (oturum rolü ADMIN)
  const owner = (await storeAuthorize({ email: "sahip@example.test", password: PASSWORD }, req("203.0.113.20"))) as { role: string } | null;
  assert.equal(owner?.role, "ADMIN");

  assert.equal(await storeAuthorize({ email: "sahip@example.test", password: "yanlis-sifre-1" }, req("203.0.113.20")), null);
  assert.equal(await storeAuthorize({ email: "olmayan@example.test", password: PASSWORD }, req("203.0.113.20")), null);

  // Müşteri hesabı panele hâlâ giremez
  assert.equal(await adminAuthorize({ login: "musteri@example.test", password: PASSWORD }, req("203.0.113.21")), null);
});

test("yönetici hesabına mağaza formundan deneme: panel girişiyle aynı hesap sınırı (sayaç ortak)", async () => {
  await createUser("hedef.yonetici@example.test", "ADMIN");
  // Panel formundan 50 yanlış deneme (farklı IP'lerden; IP sınırına takılmadan) hesabın hakkını bitirir
  for (let i = 0; i < 50; i++) {
    assert.equal(await adminAuthorize({ login: "hedef.yonetici@example.test", password: `yanlis-${i}` }, req(`198.51.100.${i}`)), null);
  }
  // Mağaza formu daha gevşek bir kapı olmaz: doğru şifreyle bile sınıra takılır
  await assert.rejects(
    storeAuthorize({ email: "hedef.yonetici@example.test", password: PASSWORD }, req("198.51.100.240")),
    (err: unknown) => err instanceof Error && err.message === LOGIN_RATE_LIMITED
  );
});

test("rol yardımcıları: mağaza oturumu üye + yönetici + personel; panel yalnız yönetici + personel", () => {
  assert.deepEqual(["CUSTOMER", "ADMIN", "STAFF", undefined, "X"].map(isStoreRole), [true, true, true, false, false]);
  assert.deepEqual(["CUSTOMER", "ADMIN", "STAFF", undefined].map(isStaffRole), [false, true, true, false]);
});
