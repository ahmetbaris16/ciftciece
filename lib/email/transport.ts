/**
 * E-postayı fiilen gönderen katman (SMTP — nodemailer). Kuyruk ve yeniden deneme bunun üstünde
 * (lib/notifications/sender.ts); şifre sıfırlama doğrudan çağırır (lib/email/mailer.ts).
 *
 * Bağımlılık gerekçesi (nodemailer): SMTP protokolünü (TLS/STARTTLS, kimlik doğrulama, MIME, Türkçe
 * karakter kodlaması) elle yazmak hata ve güvenlik riski; nodemailer bağımlılıksız ve yaygın. Sürüm ≥ 10.0.6
 * (daha eskilerinde güvenlik duyuruları var).
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Attachment, type Transporter } from "nodemailer";
import { updateMock } from "@/lib/data/mock-store";
import { siteUrl } from "./brand";
import { emailMode, smtpConfigFingerprint, smtpConfigFromEnv, type EmailMode } from "./config";
import { EMAIL_LOGO } from "./layout";

/** E-postaya eklenen dosya (ör. teslim e-postasında fatura PDF'i) */
export interface EmailAttachment {
  filename: string;
  contentType: string;
  /** Metin; ikili dosyada (PDF) base64 */
  content: string;
  encoding?: "base64";
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  attachments?: EmailAttachment[] | null;
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

/**
 * Sunucu hesabın kullanıcı adını/şifresini kabul etmedi (ör. Gmail'de normal şifre). Ayarın sorunu, e-postanın
 * değil: kuyruk bu e-postanın deneme hakkını harcamaz, turu durdurur (lib/notifications/sender.ts).
 */
export class SmtpAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmtpAuthError";
  }
}

/** Sunucuya bağlanılamadı (ad bulunamadı, port kapalı, zaman aşımı): diğer e-postalar da gidemez */
export class SmtpConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmtpConnectionError";
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
  // Testler yalnız bu bilgisayardaki sahte SMTP sunucusuna bağlanır (gerçek hesaba giriş denemesi olmasın)
  if (process.env.NODE_ENV === "test" && !/^(127\.0\.0\.1|localhost|::1)$/.test(cfg.host)) {
    throw new Error(`Test ortamında gerçek e-posta sunucusuna (${cfg.host}) bağlanılmaz.`);
  }
  // Şifre de anahtarda (parmak izi olarak): açık sitede .env değişince (next dev yeniden okur) eski şifreli
  // bağlantı kullanılmaz
  const key = smtpConfigFingerprint(cfg);
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

const CONNECTION_CODES = new Set(["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ETLS", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN"]);

/**
 * Hata sınıfı: kimlik doğrulama (EAUTH) ve bağlantı hataları ayarın sorunudur (SmtpAuthError /
 * SmtpConnectionError); SMTP yanıt koduna göre 4xx geçici (yeniden denenir), 5xx kalıcı (adres yok, reddedildi).
 */
function classify(err: unknown): Error {
  const e = err as { responseCode?: number; code?: string; message?: string };
  const msg = (e?.message ?? String(err)).slice(0, 500);
  const code = typeof e?.responseCode === "number" ? e.responseCode : null;
  if (e?.code === "EAUTH") return new SmtpAuthError(`EAUTH: ${msg}`);
  if (e?.code && CONNECTION_CODES.has(e.code)) return new SmtpConnectionError(`${e.code}: ${msg}`);
  if (code !== null && code >= 400 && code < 500) return new Error(`SMTP ${code}: ${msg}`);
  if (code !== null && code >= 500 && code < 600) {
    return new PermanentEmailError(`SMTP ${code}: ${msg}`);
  }
  // Yanıt kodu olmadan zarf hatası: adres biçimi geçersiz
  if (code === null && e?.code === "EENVELOPE") return new PermanentEmailError(msg);
  return new Error(e?.code ? `${e.code}: ${msg}` : msg);
}

/**
 * Logo e-postanın içine gömülür (cid): görseller kapalıyken ya da site adresine ulaşılamazken (yerelde deneme) de
 * görünür. Dosya okunamazsa sitedeki adresi kullanılır.
 */
async function logoBytes(): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "public", EMAIL_LOGO.publicPath));
  } catch (err) {
    console.error("[email] Logo dosyası okunamadı, site adresi kullanılacak:", (err as Error).message);
    return null;
  }
}

async function withAttachments(message: OutgoingEmail): Promise<{ html: string; attachments: Attachment[] }> {
  const attachments: Attachment[] = (message.attachments ?? []).map((a) => ({
    filename: a.filename,
    content: a.content,
    contentType: a.contentType,
    encoding: a.encoding,
  }));
  let html = message.html;
  const logoSrc = `cid:${EMAIL_LOGO.cid}`;
  if (html.includes(logoSrc)) {
    const logo = await logoBytes();
    if (logo) {
      attachments.push({ filename: "logo.png", content: logo, contentType: "image/png", cid: EMAIL_LOGO.cid, contentDisposition: "inline" });
    } else {
      html = html.split(logoSrc).join(`${siteUrl()}${EMAIL_LOGO.publicPath}`);
    }
  }
  return { html, attachments };
}

export async function deliver(message: OutgoingEmail): Promise<DeliveryResult> {
  const mode = emailMode();
  if (mode === "none") throw new EmailNotConfiguredError();
  if (mode === "dev-outbox") {
    await writeDevOutbox(message);
    return { mode, messageId: null };
  }
  const cfg = smtpConfigFromEnv()!;
  const { html, attachments } = await withAttachments(message);
  try {
    const info = await transporter().sendMail({
      from: { name: cfg.fromName, address: cfg.fromAddress },
      to: message.to,
      replyTo: message.replyTo || undefined,
      subject: message.subject,
      html,
      text: message.text,
      attachments,
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
