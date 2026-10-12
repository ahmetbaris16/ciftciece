/**
 * E-posta gönderiminin GERÇEK durumu: "ayar girildi" değil, e-posta sunucusunun son cevabı. Panel bunu
 * gösterir (önceden SMTP bilgisi girildiği anda "çalışıyor" yazıyordu; Gmail şifreyi reddederken de).
 *
 * site_settings, key "email_health": { config, lastSuccessAt, failure }. `config` ayarın parmak izidir
 * (smtpConfigFingerprint — şifre değil); ayar değişince eski hata/başarı yeni ayara sayılmaz.
 *
 * Kuyruk koruması: hesap şifreyi reddettiyse kuyruk aynı ayarla AUTH_PAUSE_MS boyunca sunucuya hiç bağlanmaz.
 * Her turda yanlış şifreyle 20 kez giriş denemek hesabı kilitletebilir (Gmail "çok fazla giriş denemesi").
 * Ayar düzelince (parmak izi değişir) beklemeden gönderir.
 */

import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";
import { emailMode, smtpConfigFingerprint, smtpConfigFromEnv, type SmtpConfig } from "./config";
import { explainSmtpError, type SmtpFailureKind } from "./errors";

export const EMAIL_HEALTH_KEY = "email_health";
/** Şifre reddedildikten sonra kuyruğun aynı ayarla yeniden denemeden beklediği süre */
export const AUTH_PAUSE_MS = 15 * 60_000;
/** Başarılı gönderim en çok bu sıklıkla yazılır (her e-postada veritabanı yazımı olmasın) */
const SUCCESS_REFRESH_MS = 10 * 60_000;

export interface EmailHealth {
  config: string;
  lastSuccessAt: string | null;
  failure: { kind: SmtpFailureKind; message: string; at: string } | null;
}

function parseHealth(value: string | null | undefined): EmailHealth | null {
  if (!value) return null;
  try {
    const v = JSON.parse(value) as Partial<EmailHealth>;
    if (typeof v.config !== "string") return null;
    const f = v.failure;
    return {
      config: v.config,
      lastSuccessAt: typeof v.lastSuccessAt === "string" ? v.lastSuccessAt : null,
      failure:
        f && (f.kind === "auth" || f.kind === "connection") && typeof f.message === "string" && typeof f.at === "string"
          ? { kind: f.kind, message: f.message, at: f.at }
          : null,
    };
  } catch {
    return null;
  }
}

export async function readEmailHealth(): Promise<EmailHealth | null> {
  if (!USE_DB) return null;
  const row = await prisma.siteSetting.findUnique({ where: { key: EMAIL_HEALTH_KEY } });
  return parseHealth(row?.value);
}

async function writeHealth(health: EmailHealth) {
  const value = JSON.stringify(health);
  await prisma.siteSetting.upsert({
    where: { key: EMAIL_HEALTH_KEY },
    update: { value },
    create: { key: EMAIL_HEALTH_KEY, value },
  });
}

/** Sunucu e-postayı kabul etti */
export async function recordSmtpSuccess(cfg: SmtpConfig, now = new Date()): Promise<void> {
  if (!USE_DB) return;
  const config = smtpConfigFingerprint(cfg);
  const prev = await readEmailHealth();
  const fresh =
    prev?.config === config &&
    !prev.failure &&
    prev.lastSuccessAt !== null &&
    now.getTime() - Date.parse(prev.lastSuccessAt) < SUCCESS_REFRESH_MS;
  if (fresh) return;
  await writeHealth({ config, lastSuccessAt: now.toISOString(), failure: null });
}

/** Sunucu düzeyinde hata (şifre reddedildi, bağlanılamadı) */
export async function recordSmtpFailure(cfg: SmtpConfig, kind: SmtpFailureKind, message: string, now = new Date()): Promise<void> {
  if (!USE_DB) return;
  const config = smtpConfigFingerprint(cfg);
  const prev = await readEmailHealth();
  await writeHealth({
    config,
    lastSuccessAt: prev?.config === config ? prev.lastSuccessAt : null,
    failure: { kind, message: message.slice(0, 500), at: now.toISOString() },
  });
}

/** Kuyruk: bu ayarın şifresi az önce reddedildiyse sunucuya bağlanma */
export async function smtpAuthPaused(cfg: SmtpConfig, now = new Date()): Promise<boolean> {
  const health = await readEmailHealth();
  return (
    !!health &&
    health.config === smtpConfigFingerprint(cfg) &&
    health.failure?.kind === "auth" &&
    now.getTime() - Date.parse(health.failure.at) < AUTH_PAUSE_MS
  );
}

// ── Panel görünümü ─────────────────────────────────────────────

export type EmailStatusTone = "ok" | "info" | "warn" | "error";

export interface EmailStatusView {
  tone: EmailStatusTone;
  text: string;
  /** Ne yapılmalı (hata durumunda) */
  detail: string | null;
  /** Yayın öncesi kontrol listesi */
  checkState: "ok" | "todo" | "manual";
}

const dateTimeTr = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(iso));

export async function getEmailStatus(env: Record<string, string | undefined> = process.env): Promise<EmailStatusView> {
  const mode = emailMode(env);
  if (mode === "none") {
    return {
      tone: "error",
      text: "E-posta gönderimi ayarlı değil: sipariş e-postaları bekliyor, müşterilere gitmiyor. Hosting'de e-posta (SMTP) bilgileri girilince kendiliğinden gönderilir (docs/YAYIN.md).",
      detail: null,
      checkState: "todo",
    };
  }
  if (mode === "dev-outbox") {
    return {
      tone: "warn",
      text: "Bu bilgisayarda e-posta hesabı ayarlı değil: sipariş e-postaları kimseye gitmez, yalnız deneme dosyasına (.mock-data/outbox.json) yazılır. Gerçek adreslere gitmesi için harbi klasöründeki “E-posta Ayarla”yı çalıştırın.",
      detail: null,
      checkState: "todo",
    };
  }
  const cfg = smtpConfigFromEnv(env)!;
  const sender = `${cfg.fromName} <${cfg.fromAddress}>`;
  const health = await readEmailHealth().catch(() => null);
  const current = health?.config === smtpConfigFingerprint(cfg) ? health : null;

  if (current?.failure) {
    const explanation = explainSmtpError(current.failure.message, {
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      production: env.NODE_ENV === "production",
    });
    return {
      tone: "error",
      text:
        current.failure.kind === "auth"
          ? `E-postalar gönderilemiyor: e-posta hesabı (${cfg.user}) şifreyi kabul etmedi.`
          : `E-postalar gönderilemiyor: e-posta sunucusuna (${cfg.host}) bağlanılamadı.`,
      detail: `${explanation} Bekleyen e-postalar silinmez; ayar düzelince kendiliğinden gönderilir. Son deneme: ${dateTimeTr(current.failure.at)}.`,
      checkState: "todo",
    };
  }
  if (current?.lastSuccessAt) {
    return {
      tone: "ok",
      text: `E-posta gönderimi çalışıyor: son başarılı gönderim ${dateTimeTr(current.lastSuccessAt)}. Müşterilere ${sender} adresinden gidiyor.`,
      detail: null,
      checkState: "ok",
    };
  }
  return {
    tone: "info",
    text: `E-posta hesabı girildi (${sender}) ama henüz denenmedi. Aşağıdan bir deneme e-postası gönderin; gelirse ayar tamamdır.`,
    detail: null,
    checkState: "manual",
  };
}
