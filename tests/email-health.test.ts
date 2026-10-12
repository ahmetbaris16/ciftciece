/**
 * E-posta gönderiminin gerçek durumu (lib/email/health.ts): hesap şifreyi reddedince panel "çalışıyor" demez,
 * kuyruk e-postanın deneme hakkını harcamaz ve sunucuyu art arda denemez; şifre düzelince (açık süreçte bile)
 * bekleyenler gider. Hata açıklamaları (Gmail uygulama şifresi) ve farklı alıcı adresleri.
 */

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { prisma } from "@/lib/db/prisma";
import { smtpConfigFromEnv } from "@/lib/email/config";
import { explainSmtpError, smtpFailureKind } from "@/lib/email/errors";
import { getEmailStatus, readEmailHealth, recordSmtpFailure } from "@/lib/email/health";
import { deliver, resetTransportCache, SmtpAuthError, SmtpConnectionError } from "@/lib/email/transport";
import { enqueueEmail } from "@/lib/notifications/queue";
import { sendDueEmails } from "@/lib/notifications/sender";
import { ContactSchema } from "@/lib/validation/checkout";
import { setupTestDb } from "./helpers/db";
import { FakeSmtpServer } from "./helpers/fake-smtp";

setupTestDb();

const smtp = new FakeSmtpServer({ password: "dogru-sifre" });
const SMTP_KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_SECURE", "SMTP_REQUIRE_TLS", "EMAIL_FROM"];

/** Sunucuyu bu şifreyle kullan (önbellek SIFIRLANMAZ: açık sitede .env değişmiş gibi) */
function useSmtp(pass: string, extra: Record<string, string> = {}) {
  Object.assign(process.env, smtp.env(), { SMTP_PASS: pass }, extra);
}

before(async () => {
  await smtp.start();
  resetTransportCache();
});
after(async () => {
  await smtp.stop();
  for (const k of SMTP_KEYS) delete process.env[k];
  resetTransportCache();
});
beforeEach(() => {
  smtp.received.length = 0;
  smtp.authAttempts = 0;
  smtp.failedAuths = 0;
});

const mail = (to: string) => ({ to, subject: "Siparişiniz alındı — Çiftçi Ece", html: "<p>Merhaba</p>", text: "Merhaba" });

async function closedPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

test("hata açıklaması: Gmail'de uygulama şifresi, Hostinger'da hPanel, bağlantı ve alıcı hatası", () => {
  const gmailErr = "EAUTH: Invalid login: 535-5.7.8 Username and Password not accepted. For more information, go to 535 5.7.8 https://support.google.com/mail/?p=BadCredentials - gsmtp";
  const gmail = { host: "smtp.gmail.com", port: 465, user: "magaza@gmail.com", production: false };
  const local = explainSmtpError(gmailErr, gmail);
  assert.match(local, /magaza@gmail\.com/);
  assert.match(local, /normal Google şifresini kabul etmez/);
  assert.match(local, /uygulama şifresi/);
  assert.match(local, /apppasswords/);
  assert.match(local, /E-posta Ayarla/);
  assert.match(explainSmtpError(gmailErr, { ...gmail, production: true }), /hPanel/);
  assert.match(
    explainSmtpError("EAUTH: Invalid login: 535 5.7.8 Error: authentication failed", {
      host: "smtp.hostinger.com",
      user: "siparis@alanadi.com",
      production: true,
    }),
    /hPanel → E-postalar/
  );
  assert.equal(smtpFailureKind(gmailErr), "auth");
  assert.equal(smtpFailureKind("EAUTH: 534-5.7.9 Application-specific password required"), "auth");
  assert.equal(smtpFailureKind("ECONNECTION: connect ECONNREFUSED 127.0.0.1:465"), "connection");
  assert.equal(smtpFailureKind("SMTP 550: 550 5.1.1 User unknown"), null);
  assert.match(explainSmtpError("ETIMEDOUT: Greeting never received", gmail), /bağlanılamadı/);
  assert.match(explainSmtpError("SMTP 550: Can't send mail - all recipients were rejected: 550 5.1.1 User unknown", gmail), /Alıcı adresi/);
});

test("yanlış şifre SmtpAuthError olur; şifre düzelince açık süreç yeni şifreyi kullanır (bağlantı önbelleği)", async () => {
  useSmtp("normal-google-sifresi1");
  await assert.rejects(deliver(mail("ayse@ornek.test")), (e: unknown) => e instanceof SmtpAuthError && /EAUTH/.test(e.message));
  assert.equal(smtp.failedAuths, 1);
  // Önbellek sıfırlanmadan yalnız ortam değişkeni değişir (next dev .env'i yeniden okuyunca böyle olur)
  useSmtp("dogru-sifre");
  const r = await deliver(mail("ayse@ornek.test"));
  assert.equal(r.mode, "smtp");
  assert.equal(smtp.received.length, 1);
  assert.equal(smtp.received[0].auth?.pass, "dogru-sifre");
});

test("bağlanılamayan sunucu SmtpConnectionError olur", async () => {
  useSmtp("dogru-sifre", { SMTP_PORT: String(await closedPort()) });
  try {
    await assert.rejects(deliver(mail("ayse@ornek.test")), (e: unknown) => e instanceof SmtpConnectionError);
  } finally {
    useSmtp("dogru-sifre");
  }
});

test("kuyruk: şifre reddedilince hak harcanmaz, tek giriş denemesi, beklemede sunucuya bağlanmaz; düzelince hepsi gider", async () => {
  for (const k of ["a1", "a2", "a3"]) {
    await enqueueEmail(prisma, { kind: "TEST", dedupeKey: k, audience: "customer", ...mail(`${k}@ornek.test`) });
  }
  useSmtp("normal-google-sifresi1");

  const r1 = await sendDueEmails();
  assert.equal(r1.blocked, "auth");
  assert.equal(r1.sent, 0);
  assert.equal(smtp.failedAuths, 1, "üç e-posta için tek giriş denemesi");
  const rows = await prisma.emailMessage.findMany({ orderBy: { dedupeKey: "asc" } });
  assert.deepEqual(rows.map((r) => [r.status, r.attempts]), [["QUEUED", 0], ["QUEUED", 0], ["QUEUED", 0]]);
  assert.match(rows[0].lastError ?? "", /EAUTH/);

  // Panel gerçeği söyler
  const failing = await getEmailStatus();
  assert.equal(failing.tone, "error");
  assert.match(failing.text, /şifreyi kabul etmedi/);
  assert.match(failing.detail ?? "", /silinmez/);
  assert.equal(failing.checkState, "todo");

  // 15 dk dolmadan aynı ayarla sunucuya hiç bağlanılmaz
  const r2 = await sendDueEmails();
  assert.equal(r2.blocked, "auth");
  assert.equal(smtp.authAttempts, 1);
  // Süre dolunca bir kez daha dener
  const r3 = await sendDueEmails({ now: new Date(Date.now() + 16 * 60_000) });
  assert.equal(r3.blocked, "auth");
  assert.equal(smtp.failedAuths, 2);

  // Şifre düzeldi (ayarın parmak izi değişti): beklemeden hepsi gider
  useSmtp("dogru-sifre");
  const r4 = await sendDueEmails();
  assert.equal(r4.blocked, null);
  assert.equal(r4.sent, 3);
  assert.deepEqual(smtp.received.map((m) => m.to[0]).sort(), ["a1@ornek.test", "a2@ornek.test", "a3@ornek.test"]);
  const ok = await getEmailStatus();
  assert.equal(ok.tone, "ok");
  assert.match(ok.text, /çalışıyor/);
  assert.match(ok.text, /siparis@ornek-magaza\.test/);
  assert.equal(ok.checkState, "ok");
  assert.equal((await readEmailHealth())?.failure, null);
});

test("kuyruk: sunucuya bağlanılamazsa o e-postanın denemesi sayılır, tur durur (diğerleri beklemez)", async () => {
  for (const k of ["b1", "b2"]) {
    await enqueueEmail(prisma, { kind: "TEST", dedupeKey: k, audience: "customer", ...mail(`${k}@ornek.test`) });
  }
  useSmtp("dogru-sifre", { SMTP_PORT: String(await closedPort()) });
  try {
    const r = await sendDueEmails();
    assert.equal(r.blocked, "connection");
    assert.equal(r.retried, 1);
    const rows = await prisma.emailMessage.findMany({ orderBy: { dedupeKey: "asc" } });
    assert.deepEqual(rows.map((x) => x.attempts), [1, 0]);
    const status = await getEmailStatus();
    assert.equal(status.tone, "error");
    assert.match(status.text, /bağlanılamadı/);
  } finally {
    useSmtp("dogru-sifre");
  }
});

test("panel durumu: ayar girildi ama denenmedi → 'henüz denenmedi'; eski ayarın hatası yeni ayara sayılmaz; ayarsız kipler", async () => {
  useSmtp("normal-google-sifresi1");
  await recordSmtpFailure(smtpConfigFromEnv()!, "auth", "EAUTH: Invalid login: 535-5.7.8 Username and Password not accepted.");
  assert.equal((await getEmailStatus()).tone, "error");
  useSmtp("dogru-sifre");
  const fresh = await getEmailStatus();
  assert.equal(fresh.tone, "info");
  assert.match(fresh.text, /henüz denenmedi/);
  assert.equal(fresh.checkState, "manual");

  const env = { NODE_ENV: "development", SMTP_HOST: "" };
  assert.equal((await getEmailStatus({ ...process.env, ...env })).tone, "warn");
  assert.equal((await getEmailStatus({ ...process.env, ...env, NODE_ENV: "production" })).tone, "error");
});

test("müşteri hangi adresi yazarsa yazsın: sipariş formu kabul eder, e-posta işletme hesabından o adrese gider", async () => {
  useSmtp("dogru-sifre");
  const addresses = [
    "ayse.yilmaz@gmail.com",
    "Mehmet+siparis@Hotmail.com",
    "bilgi@ornek-firma.com.tr",
    "x_y@posta.alanadi.istanbul",
    "kullanici@outlook.com",
    "ad.soyad@yandex.com.tr",
  ];
  for (const to of addresses) {
    const parsed = ContactSchema.shape.email.safeParse(to);
    assert.ok(parsed.success, `sipariş formu kabul etmeli: ${to}`);
    await deliver(mail(parsed.data!));
  }
  assert.equal(smtp.received.length, addresses.length);
  for (const [i, m] of smtp.received.entries()) {
    assert.equal(m.to[0], addresses[i].toLowerCase());
    assert.equal(m.from, "siparis@ornek-magaza.test", "gönderen her zaman işletmenin hesabı");
    assert.match(m.raw, /^From: =\?UTF-8\?|^From: "?Çiftçi Ece|^From: .*siparis@ornek-magaza\.test/im);
  }
});
