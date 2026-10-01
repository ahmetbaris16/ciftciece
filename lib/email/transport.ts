/**
 * E-postayı fiilen gönderen katman (SMTP — nodemailer). Kuyruk ve yeniden deneme bunun üstünde
 * (lib/notifications/sender.ts); şifre sıfırlama doğrudan çağırır (lib/email/mailer.ts).
 *
 * Bağımlılık gerekçesi (nodemailer): SMTP protokolünü (TLS/STARTTLS, kimlik doğrulama, MIME, Türkçe
 * karakter kodlaması) elle yazmak hata ve güvenlik riski; nodemailer bağımlılıksız ve yaygın. Sürüm ≥ 10.0.6
 * (daha eskilerinde güvenlik duyuruları var).
 */

import nodemailer, { type Transporter } from "nodemailer";
import { updateMock } from "@/lib/data/mock-store";
import { emailMode, smtpConfigFromEnv, type EmailMode } from "./config";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
}

export interface DeliveryResult {
  mode: EmailMode;
  messageId: string | null;
}

/** Kalıcı hata (adres yok, reddedildi): yeniden denemek anlamsız */
export class PermanentEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentEmailError";
  }
}

/** Gönderim ayarı yok: e-posta kuyrukta beklemeli (hata sayılmaz) */
export class EmailNotConfiguredError extends Error {
  constructor() {
    super("E-posta gönderimi ayarlı değil (SMTP_HOST / SMTP_USER / SMTP_PASS).");
    this.name = "EmailNotConfiguredError";
  }
}

let cached: { key: string; transporter: Transporter } | null = null;

function transporter(): Transporter {
  const cfg = smtpConfigFromEnv();
  if (!cfg) throw new EmailNotConfiguredError();
  const key = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}`;
  if (cached?.key === key) return cached.transporter;
  const t = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    requireTLS: cfg.requireTLS,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    tls: { minVersion: "TLSv1.2" },
  });
  cached = { key, transporter: t };
  return t;
}

const OUTBOX = "outbox.json";

/** Geliştirme: son 30 e-posta .mock-data/outbox.json'da (bağlantıları denemek için) */
async function writeDevOutbox(message: OutgoingEmail): Promise<void> {
  await updateMock<Array<OutgoingEmail & { at: string }>, void>(OUTBOX, [], (list) => ({
    next: [...list, { ...message, at: new Date().toISOString() }].slice(-30),
    result: undefined,
  }));
  console.info(`[email] (geliştirme) "${message.subject}" → ${maskEmail(message.to)} — .mock-data/${OUTBOX}`);
}

/** Loglarda kişisel veri maskelenir: ay***@example.com */
export function maskEmail(address: string): string {
  const [local, domain] = address.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * SMTP yanıt koduna göre kalıcı mı geçici mi: 4xx geçici (yeniden denenir), 5xx kalıcı (adres yok, reddedildi).
 * Kimlik doğrulama hatası (EAUTH) geçici sayılır: ayar düzeltilince kuyruktaki e-postalar gider.
 */
function classify(err: unknown): Error {
  const e = err as { responseCode?: number; code?: string; message?: string };
  const msg = (e?.message ?? String(err)).slice(0, 500);
  const code = typeof e?.responseCode === "number" ? e.responseCode : null;
  if (code !== null && code >= 400 && code < 500) return new Error(`SMTP ${code}: ${msg}`);
  if (code !== null && code >= 500 && code < 600 && e.code !== "EAUTH") {
    return new PermanentEmailError(`SMTP ${code}: ${msg}`);
  }
  // Yanıt kodu olmadan zarf hatası: adres biçimi geçersiz
  if (code === null && e?.code === "EENVELOPE") return new PermanentEmailError(msg);
  return new Error(e?.code ? `${e.code}: ${msg}` : msg);
}

export async function deliver(message: OutgoingEmail): Promise<DeliveryResult> {
  const mode = emailMode();
  if (mode === "none") throw new EmailNotConfiguredError();
  if (mode === "dev-outbox") {
    await writeDevOutbox(message);
    return { mode, messageId: null };
  }
  const cfg = smtpConfigFromEnv()!;
  try {
    const info = await transporter().sendMail({
      from: { name: cfg.fromName, address: cfg.fromAddress },
      to: message.to,
      replyTo: message.replyTo || undefined,
      subject: message.subject,
      html: message.html,
      text: message.text,
      // Dosya/URL'den içerik okuma kapalı (şablonlar hep satır içi)
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    return { mode, messageId: typeof info.messageId === "string" ? info.messageId : null };
  } catch (err) {
    throw classify(err);
  }
}

/** Testler ve ayar değişikliği için önbelleği bırakır */
export function resetTransportCache() {
  cached = null;
}
