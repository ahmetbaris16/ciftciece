/**
 * E-posta altyapısı: SMTP ayarı, gönderim (sahte SMTP sunucusu, gerçek protokol), kuyruk, yeniden deneme,
 * kalıcı hata, süresi geçen e-posta, outbox → e-posta dağıtımı, cron ucu.
 */

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { emailConfigWarnings, emailMode, parseFromHeader, smtpConfigFromEnv } from "@/lib/email/config";
import { deliver, PermanentEmailError, resetTransportCache } from "@/lib/email/transport";
import { enqueueEmail } from "@/lib/notifications/queue";
import { MAX_EMAIL_ATTEMPTS, requeueEmail, sendDueEmails } from "@/lib/notifications/sender";
import { processOutbox } from "@/lib/notifications/dispatcher";
import { saveBusinessInfo } from "@/lib/business/business.repository";
import { parseBusinessInfo } from "@/lib/business/info";
import { writeOutbox } from "@/lib/outbox";
import { GET as cronGet } from "@/app/api/cron/run/route";
import { setupTestDb } from "./helpers/db";
import { FakeSmtpServer, partOf, subjectOf } from "./helpers/fake-smtp";

setupTestDb();

const smtp = new FakeSmtpServer({
  password: "test-sifre",
  rejectRecipients: ["yok@ornek.test"],
  tempFailRecipients: ["gecici@ornek.test"],
});
const savedEnv = { ...process.env };

before(async () => {
  await smtp.start();
  Object.assign(process.env, smtp.env());
  resetTransportCache();
});
after(async () => {
  await smtp.stop();
  for (const k of Object.keys(smtp.env())) delete process.env[k];
  Object.assign(process.env, { CRON_SECRET: savedEnv.CRON_SECRET });
  if (!savedEnv.CRON_SECRET) delete process.env.CRON_SECRET;
});
beforeEach(() => {
  smtp.received.length = 0;
});

function draft(to: string, key: string) {
  return {
    kind: "TEST",
    dedupeKey: key,
    audience: "customer" as const,
    to,
    subject: "Siparişiniz alındı — Çiftçi Ece",
    html: "<p>Merhaba Ayşe, siparişiniz <strong>alındı</strong>.</p>",
    text: "Merhaba Ayşe, siparişiniz alındı.",
  };
}

test("SMTP ayarı: 465 SSL, 587 STARTTLS zorunlu, yer tutucu yok sayılır, gönderen uyarısı", () => {
  const base = { SMTP_HOST: "smtp.hostinger.com", SMTP_USER: "siparis@ornek.com", SMTP_PASS: "gizli-sifre-123" };
  const ssl = smtpConfigFromEnv({ ...base, SMTP_PORT: "465" });
  assert.equal(ssl?.secure, true);
  assert.equal(ssl?.requireTLS, false);
  const tls = smtpConfigFromEnv({ ...base, SMTP_PORT: "587" });
  assert.equal(tls?.secure, false);
  assert.equal(tls?.requireTLS, true);
  assert.equal(smtpConfigFromEnv({ ...base, SMTP_PASS: "TODO" }), null);
  assert.equal(smtpConfigFromEnv({ ...base, SMTP_HOST: "" }), null);
  assert.equal(emailMode({ NODE_ENV: "production" }), "none");
  assert.equal(emailMode({ NODE_ENV: "development" }), "dev-outbox");
  assert.deepEqual(parseFromHeader("Çiftçi Ece <Siparis@Ornek.com>"), { name: "Çiftçi Ece", address: "siparis@ornek.com" });
  const warn = emailConfigWarnings({ ...base, SMTP_PORT: "465", EMAIL_FROM: "Çiftçi Ece <bilgi@ornek.com>" });
  assert.ok(warn.some((w) => w.includes("farklı")), "gönderen adresi hesaptan farklıysa uyarı");
  assert.deepEqual(emailConfigWarnings({ ...base, SMTP_PORT: "465" }), []);
});

test("gönderim: gerçek SMTP protokolüyle, kimlik doğrulamalı, Türkçe konu bozulmadan", async () => {
  const r = await deliver({ to: "ayse@ornek.test", subject: "Siparişiniz alındı — Çiftçi Ece", html: "<p>Şık</p>", text: "Şık" });
  assert.equal(r.mode, "smtp");
  assert.equal(smtp.received.length, 1);
  const msg = smtp.received[0];
  assert.deepEqual(msg.to, ["ayse@ornek.test"]);
  assert.equal(msg.from, "siparis@ornek-magaza.test");
  assert.deepEqual(msg.auth, { user: "siparis@ornek-magaza.test", pass: "test-sifre" });
  assert.equal(subjectOf(msg.raw), "Siparişiniz alındı — Çiftçi Ece");
  assert.match(partOf(msg.raw, "text/html"), /Şık/);
  assert.match(partOf(msg.raw, "text/plain"), /Şık/);
});

test("kalıcı hata (550) PermanentEmailError olarak sınıflanır", async () => {
  await assert.rejects(
    deliver({ to: "yok@ornek.test", subject: "x", html: "x", text: "x" }),
    (err: unknown) => err instanceof PermanentEmailError
  );
});

test("kuyruk: aynı anahtar ikinci kez eklenmez; gönderilir ve SENT olur", async () => {
  assert.equal(await enqueueEmail(prisma, draft("ayse@ornek.test", "k1")), true);
  assert.equal(await enqueueEmail(prisma, draft("ayse@ornek.test", "k1")), false);
  const r = await sendDueEmails();
  assert.equal(r.sent, 1);
  assert.equal(smtp.received.length, 1);
  const row = await prisma.emailMessage.findUniqueOrThrow({ where: { dedupeKey: "k1" } });
  assert.equal(row.status, "SENT");
  assert.equal(row.attempts, 1);
  assert.ok(row.sentAt);
  assert.match(row.providerMessageId ?? "", /@/);
  // İkinci çalıştırma tekrar göndermez
  assert.equal((await sendDueEmails()).sent, 0);
  assert.equal(smtp.received.length, 1);
});

test("geçici hata: yeniden denenecek şekilde ertelenir; deneme hakkı bitince FAILED", async () => {
  await enqueueEmail(prisma, draft("gecici@ornek.test", "k2"));
  const r = await sendDueEmails();
  assert.equal(r.retried, 1);
  let row = await prisma.emailMessage.findUniqueOrThrow({ where: { dedupeKey: "k2" } });
  assert.equal(row.status, "QUEUED");
  assert.equal(row.attempts, 1);
  assert.ok(row.availableAt.getTime() > Date.now() + 30_000, "en az ~1 dk sonra");
  assert.match(row.lastError ?? "", /451|Temporary/);
  // Süre dolmadan yeniden denenmez
  assert.equal((await sendDueEmails()).retried, 0);
  // Son deneme: hak bitince FAILED
  await prisma.emailMessage.update({ where: { id: row.id }, data: { attempts: MAX_EMAIL_ATTEMPTS - 1, availableAt: new Date(0) } });
  assert.equal((await sendDueEmails()).failed, 1);
  row = await prisma.emailMessage.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(row.status, "FAILED");
  // Admin yeniden kuyruğa alabilir
  assert.equal(await requeueEmail(row.id), true);
  row = await prisma.emailMessage.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(row.status, "QUEUED");
  assert.equal(row.attempts, 0);
});

test("kalıcı hata hemen FAILED olur, yeniden denenmez", async () => {
  await enqueueEmail(prisma, draft("yok@ornek.test", "k3"));
  const r = await sendDueEmails();
  assert.equal(r.failed, 1);
  const row = await prisma.emailMessage.findUniqueOrThrow({ where: { dedupeKey: "k3" } });
  assert.equal(row.status, "FAILED");
  assert.match(row.lastError ?? "", /550/);
});

test("süresi geçmiş e-posta gönderilmez; yarıda kalmış gönderim kuyruğa döner", async () => {
  await enqueueEmail(prisma, { ...draft("ayse@ornek.test", "k4"), expiresAt: new Date(Date.now() - 1000) });
  await enqueueEmail(prisma, draft("ayse@ornek.test", "k5"));
  // k5: başka süreç almış ve çökmüş (kilit süresi geçmiş)
  await prisma.emailMessage.update({
    where: { dedupeKey: "k5" },
    data: { status: "SENDING", lockedUntil: new Date(Date.now() - 1000), attempts: 1 },
  });
  const r = await sendDueEmails();
  assert.equal(r.sent, 1);
  assert.equal((await prisma.emailMessage.findUniqueOrThrow({ where: { dedupeKey: "k4" } })).status, "CANCELLED");
  assert.equal((await prisma.emailMessage.findUniqueOrThrow({ where: { dedupeKey: "k5" } })).status, "SENT");
  assert.deepEqual(smtp.received.map((m) => m.to[0]), ["ayse@ornek.test"]);
});

test("canlıda e-posta ayarı yoksa gönderilmez, kuyrukta bekler", async () => {
  await enqueueEmail(prisma, draft("ayse@ornek.test", "k6"));
  const env = { ...process.env };
  try {
    delete process.env.SMTP_HOST;
    Object.assign(process.env, { NODE_ENV: "production" });
    const r = await sendDueEmails();
    assert.equal(r.notConfigured, true);
    assert.equal(r.sent, 0);
  } finally {
    Object.assign(process.env, env);
    if (env.NODE_ENV === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
  }
  const row = await prisma.emailMessage.findUniqueOrThrow({ where: { dedupeKey: "k6" } });
  assert.equal(row.status, "QUEUED");
  assert.equal(row.attempts, 0);
});

test("outbox: ödeme uyarısı işletmeye e-posta olur; olay bir kez işlenir", async () => {
  await saveBusinessInfo({ ...parseBusinessInfo(null), email: "bilgi@ornek.test", notificationEmail: "patron@ornek.test" });
  await prisma.$transaction((tx) =>
    writeOutbox(tx, {
      topic: "payment.alert",
      aggregateType: "payment",
      aggregateId: "x",
      dedupeKey: "payment.alert:test-1",
      payload: { kind: "PAYMENT_MISMATCH", message: "Tutar tutmadı", orderId: null, attemptId: null },
    })
  );
  const d1 = await processOutbox();
  assert.equal(d1.processed, 1);
  assert.equal(d1.emails, 1);
  const d2 = await processOutbox();
  assert.equal(d2.processed, 0, "yayınlanmış olay tekrar işlenmez");
  const email = await prisma.emailMessage.findFirstOrThrow({ where: { kind: "STORE_PAYMENT_ALERT" } });
  assert.equal(email.toAddress, "patron@ornek.test");
  assert.match(email.subject, /Ödeme doğrulaması tutmadı/);
  await sendDueEmails();
  assert.equal(smtp.received.length, 1);
  assert.deepEqual(smtp.received[0].to, ["patron@ornek.test"]);
});

test("outbox: bildirim adresi yoksa işletmeye e-posta oluşmaz, olay yine kapanır", async () => {
  await prisma.$transaction((tx) =>
    writeOutbox(tx, {
      topic: "payment.alert",
      aggregateType: "payment",
      aggregateId: "y",
      dedupeKey: "payment.alert:test-2",
      payload: { kind: "FRAUD_REVIEW", message: "İnceleme", orderId: null, attemptId: null },
    })
  );
  const d = await processOutbox();
  assert.equal(d.processed, 1);
  assert.equal(d.emails, 0);
  assert.equal(await prisma.emailMessage.count(), 0);
  const ev = await prisma.outboxEvent.findUniqueOrThrow({ where: { dedupeKey: "payment.alert:test-2" } });
  assert.ok(ev.publishedAt);
});

test("cron ucu: anahtar yoksa 503, yanlışsa 401, doğruysa işleri çalıştırır", async () => {
  delete process.env.CRON_SECRET;
  assert.equal((await cronGet(new NextRequest("http://localhost/api/cron/run"))).status, 503);
  process.env.CRON_SECRET = "c".repeat(32);
  const wrong = await cronGet(new NextRequest("http://localhost/api/cron/run", { headers: { authorization: "Bearer yanlis" } }));
  assert.equal(wrong.status, 401);
  await enqueueEmail(prisma, draft("ayse@ornek.test", "k7"));
  const ok = await cronGet(
    new NextRequest("http://localhost/api/cron/run", { headers: { authorization: `Bearer ${"c".repeat(32)}` } })
  );
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.jobs.map((j: { name: string }) => j.name), ["kart-odeme-mutabakati", "suresi-dolan-siparisler", "havale-hatirlatma", "bildirimler"]);
  assert.equal(smtp.received.length, 1, "kuyruktaki e-posta cron ile gönderildi");
  // Sorgu parametresiyle de çalışır
  const viaQuery = await cronGet(new NextRequest(`http://localhost/api/cron/run?key=${"c".repeat(32)}`));
  assert.equal(viaQuery.status, 200);
});
