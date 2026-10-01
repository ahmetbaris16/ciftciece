/**
 * E-posta gönderimi — Resend HTTP API (https://resend.com).
 *
 * Gerekli ortam değişkenleri: RESEND_API_KEY ve EMAIL_FROM (Resend'de doğrulanmış alan adından bir adres,
 * ör. "Çiftçi Ece <bildirim@alanadiniz.com>"). İkisi de gerçek değer değilse gönderim KAPALIDIR:
 * - production: e-posta isteyen özellikler (şifre sıfırlama) bunu açıkça söyler, sessizce "gönderildi" demez;
 * - geliştirme: e-posta gönderilmez, .mock-data/outbox.json'a yazılır (bağlantıyı denemek için).
 */

import { readMock, updateMock } from "@/lib/data/mock-store";

export type EmailDelivery = "resend" | "dev-outbox" | "none";

const isPlaceholder = (v: string | undefined) => !v || /todo|xxx|your_|örnek|ornek/i.test(v);

export function emailDelivery(): EmailDelivery {
  if (!isPlaceholder(process.env.RESEND_API_KEY) && !isPlaceholder(process.env.EMAIL_FROM)) return "resend";
  return process.env.NODE_ENV === "production" ? "none" : "dev-outbox";
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const OUTBOX = "outbox.json";

interface OutboxEntry extends EmailMessage {
  at: string;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const mode = emailDelivery();
  if (mode === "none") throw new Error("E-posta gönderimi yapılandırılmadı (RESEND_API_KEY / EMAIL_FROM).");

  if (mode === "dev-outbox") {
    await updateMock<OutboxEntry[], void>(OUTBOX, [], (list) => ({
      next: [...list, { ...message, at: new Date().toISOString() }].slice(-20),
      result: undefined,
    }));
    console.info(`[email] (geliştirme) "${message.subject}" → ${message.to} — .mock-data/${OUTBOX}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }
}

/** Geliştirme: son gönderilen e-postalar (test ve hata ayıklama için) */
export async function readDevOutbox(): Promise<OutboxEntry[]> {
  return readMock<OutboxEntry[]>(OUTBOX, []);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Basit, tüm e-posta istemcilerinde okunur şablon (tablo + satır içi stil) */
export function simpleEmailHtml(opts: { title: string; paragraphs: string[]; button?: { label: string; url: string }; footer: string }) {
  const p = opts.paragraphs
    .map((t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#2b2a26">${escapeHtml(t)}</p>`)
    .join("");
  const btn = opts.button
    ? `<p style="margin:22px 0"><a href="${escapeHtml(opts.button.url)}" style="display:inline-block;padding:12px 22px;background:#2f3b1f;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">${escapeHtml(opts.button.label)}</a></p>
       <p style="margin:0 0 14px;font-size:12px;line-height:1.6;color:#77736a">Düğme çalışmazsa bu adresi tarayıcınıza yapıştırın:<br>${escapeHtml(opts.button.url)}</p>`
    : "";
  return `<!doctype html><html lang="tr"><body style="margin:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:12px;padding:28px">
<tr><td>
<p style="margin:0 0 18px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#8a7a3c">Çiftçi Ece</p>
<h1 style="margin:0 0 16px;font-size:21px;color:#1d1c19">${escapeHtml(opts.title)}</h1>
${p}${btn}
<p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#77736a">${escapeHtml(opts.footer)}</p>
</td></tr></table></td></tr></table></body></html>`;
}
