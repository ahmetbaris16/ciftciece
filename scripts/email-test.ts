/**
 * E-posta (SMTP) ayarını dener: .env'deki bilgilerle doğrudan (kuyruksuz) bir deneme e-postası gönderir, sonucu
 * anlaşılır Türkçe yazar. Site çalışmıyor olsa da, veritabanı kapalı olsa da çalışır.
 *
 *   npm run email:test -- alici@ornek.com
 *
 * Bilgisayarda harbi/"E-posta Ayarla.bat" bilgileri sorar, önce bununla dener (bilgileri ortam değişkeni olarak
 * verir; ortam değişkeni .env'den önce gelir), yalnız gönderim başarılıysa .env'e yazar. .env, Next.js'in okuduğu
 * gibi okunur (@next/env: aynı tırnak ve $ kuralları). Şifre ekrana ya da kayda yazılmaz.
 *
 * Çıkış kodu: 0 gönderildi · 1 gönderilemedi · 2 kullanım hatası · 3 hesap şifreyi kabul etmedi
 */

import path from "node:path";
// Next.js'in kendi .env okuyucusu (next paketinin bağımlılığı; ayrı kurulum gerekmez)
import { loadEnvConfig } from "@next/env";

loadEnvConfig(path.resolve(__dirname, ".."), true, { info: () => {}, error: console.error });

async function main() {
  const to = (process.argv[2] ?? "").trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) {
    console.error("Kullanım: npm run email:test -- alici@ornek.com");
    process.exitCode = 2;
    return;
  }
  const { smtpConfigFromEnv, emailConfigWarnings } = await import("../lib/email/config");
  const cfg = smtpConfigFromEnv();
  if (!cfg) {
    console.error("E-posta ayarı eksik: .env'de SMTP_HOST, SMTP_USER ve SMTP_PASS olmalı. Önce “E-posta Ayarla”yı çalıştırın.");
    process.exitCode = 1;
    return;
  }
  for (const w of emailConfigWarnings()) console.warn(`Uyarı: ${w}`);
  console.log(`Gönderiliyor: ${cfg.host}:${cfg.port} (${cfg.secure ? "SSL" : cfg.requireTLS ? "STARTTLS" : "şifresiz"}) · gönderen ${cfg.fromName} <${cfg.fromAddress}>`);

  const { deliver, maskEmail, SmtpAuthError } = await import("../lib/email/transport");
  const { explainSmtpError } = await import("../lib/email/errors");
  const { testEmail } = await import("../lib/email/templates/account");
  const { parseBusinessInfo } = await import("../lib/business/info");
  // Veritabanı gerekmesin: işletme bilgisi varsayılanlarla (e-posta altbilgisi)
  const mail = testEmail({ business: parseBusinessInfo(null), sentBy: "E-posta Ayarla (bu bilgisayar)" });
  try {
    const r = await deliver({ to, subject: mail.subject, html: mail.html, text: mail.text });
    if (r.mode !== "smtp") throw new Error(`Gönderim kipi ${r.mode}: e-posta gönderilmedi.`);
    console.log(`TAMAM: deneme e-postası ${maskEmail(to)} adresine gönderildi. Gelen kutusunu (ve istenmeyen/spam klasörünü) kontrol edin.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`GÖNDERİLEMEDİ: ${message}`);
    console.error("");
    const inSetup = process.env.CE_EMAIL_SETUP === "1";
    console.error(explainSmtpError(message, { host: cfg.host, port: cfg.port, user: cfg.user, production: false, inSetup }));
    process.exitCode = err instanceof SmtpAuthError ? 3 : 1;
  }
}

void main();
