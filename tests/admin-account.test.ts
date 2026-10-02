/**
 * Yönetici hesabı: panelden kullanıcı adı/e-posta/şifre değiştirme (mevcut şifre şart, kurallar, çakışma),
 * şifre değişince eski oturumların düşmesi için passwordResetAt; komut satırından hesap açma/güncelleme.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import {
  AdminAccountError,
  adminLoginLookup,
  adminPasswordError,
  updateAdminAccount,
  upsertAdminAccount,
  usernameError,
} from "@/lib/auth/admin-account";
import { setupTestDb } from "./helpers/db";

setupTestDb();

const PASSWORD = "Mevcut-Sifre-2026";

async function admin(email = "yonetici@example.test", username: string | null = null) {
  return prisma.user.create({ data: { email, username, name: "Yönetici", role: "ADMIN", passwordHash: await hash(PASSWORD, 4) } });
}

const rejects = (p: Promise<unknown>, status: number, re?: RegExp) =>
  assert.rejects(p, (err: unknown) => err instanceof AdminAccountError && err.status === status && (!re || re.test(err.message)));

test("kurallar: kullanıcı adı küçük harf/rakam/._- (3–40), şifre en az 12 karakter harf+rakam; giriş adı ayrımı", () => {
  assert.equal(usernameError("ece"), null);
  assert.equal(usernameError("ece.yonetici_1"), null);
  assert.notEqual(usernameError("ec"), null);
  assert.notEqual(usernameError("çiftçi"), null);
  assert.notEqual(usernameError(".ece"), null);
  assert.notEqual(usernameError("ece yonetici"), null);
  assert.equal(adminPasswordError("Zeytin-Yagi-2026"), null);
  assert.notEqual(adminPasswordError("kisa1"), null);
  assert.notEqual(adminPasswordError("sadeceharflerdenolusan"), null);
  assert.deepEqual(adminLoginLookup("  Ece.Yonetici "), { username: "ece.yonetici" });
  assert.deepEqual(adminLoginLookup("Ece@Example.TEST"), { email: "ece@example.test" });
});

test("panelden değiştirme: mevcut şifre yanlışsa hiçbir şey değişmez; doğruysa kullanıcı adı ve e-posta güncellenir", async () => {
  const u = await admin();
  await rejects(updateAdminAccount(u.id, { currentPassword: "yanlis", username: "ece", email: u.email }), 403);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).username, null);

  await rejects(updateAdminAccount(u.id, { currentPassword: PASSWORD, username: "Çiftçi Ece", email: u.email }), 400, /Kullanıcı adı/);
  await rejects(updateAdminAccount(u.id, { currentPassword: PASSWORD, username: "ece", email: "eposta-degil" }), 400, /e-posta/);

  const r = await updateAdminAccount(u.id, { currentPassword: PASSWORD, username: "Ece", email: "Ece@Example.test" });
  assert.equal(r.username, "ece");
  assert.equal(r.email, "ece@example.test");
  assert.equal(r.passwordChanged, false);
  const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
  assert.equal(after.passwordResetAt, null, "şifre değişmedi: oturumlar düşmez");
});

test("şifre değişimi: yeni şifre kurala uymalı; değişince eski şifre geçmez ve passwordResetAt yazılır", async () => {
  const u = await admin("sifre@example.test", "sifreci");
  await rejects(updateAdminAccount(u.id, { currentPassword: PASSWORD, username: "sifreci", email: u.email, newPassword: "kisa" }), 400, /Şifre/);
  const r = await updateAdminAccount(u.id, {
    currentPassword: PASSWORD,
    username: "sifreci",
    email: u.email,
    newPassword: "Yeni-Zeytin-Sifre-9",
  });
  assert.equal(r.passwordChanged, true);
  const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
  assert.ok(after.passwordResetAt, "eski oturumlar düşsün");
  assert.equal(await verifyPassword("Yeni-Zeytin-Sifre-9", after.passwordHash), true);
  assert.equal(await verifyPassword(PASSWORD, after.passwordHash), false);
});

test("çakışma: başka hesabın kullanıcı adı ya da e-postası alınamaz; müşteri hesabı değiştirilemez", async () => {
  const a = await admin("a@example.test", "birinci");
  await admin("b@example.test", "ikinci");
  await rejects(updateAdminAccount(a.id, { currentPassword: PASSWORD, username: "ikinci", email: a.email }), 409, /kullanıcı adı/);
  await rejects(updateAdminAccount(a.id, { currentPassword: PASSWORD, username: "birinci", email: "b@example.test" }), 409, /e-posta/);
  const customer = await prisma.user.create({
    data: { email: "musteri@example.test", role: "CUSTOMER", passwordHash: await hash(PASSWORD, 4) },
  });
  await rejects(updateAdminAccount(customer.id, { currentPassword: PASSWORD, username: "musteri", email: customer.email }), 404);
});

test("komut satırı: yönetici yoksa açılır, varsa (e-postayla bulunur) kullanıcı adı ve şifresi güncellenir; müşteriye dokunulmaz", async () => {
  const created = await upsertAdminAccount({ username: "Ece", email: "ece@example.test", password: "Ilk-Kurulum-Sifre-1" });
  assert.deepEqual(created, { created: true, username: "ece", email: "ece@example.test" });
  const u = await prisma.user.findUniqueOrThrow({ where: { username: "ece" } });
  assert.equal(u.role, "ADMIN");
  assert.equal(await verifyPassword("Ilk-Kurulum-Sifre-1", u.passwordHash), true);

  const updated = await upsertAdminAccount({ username: "ece.zeytin", email: "ece@example.test", password: "Ikinci-Sifre-2026" });
  assert.equal(updated.created, false);
  const again = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
  assert.equal(again.username, "ece.zeytin");
  assert.ok(again.passwordResetAt);
  assert.equal(await prisma.user.count({ where: { role: "ADMIN" } }), 1);

  await prisma.user.create({ data: { email: "musteri@example.test", role: "CUSTOMER", passwordHash: await hash(PASSWORD, 4) } });
  await rejects(upsertAdminAccount({ username: "yeni", email: "musteri@example.test", password: "Gecerli-Sifre-123" }), 409, /müşteri/);
  await rejects(upsertAdminAccount({ username: "x", email: "a@example.test", password: "Gecerli-Sifre-123" }), 400);
});
