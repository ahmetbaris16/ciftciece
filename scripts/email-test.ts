/**
 * E-posta (SMTP) ayarını dener: .env'deki bilgilerle doğrudan (kuyruksuz) bir deneme e-postası gönderir, sonucu
 * anlaşılır Türkçe yazar. Site çalışmıyor olsa da, veritabanı kapalı olsa da çalışır.
 *
 *   npm run email:test -- alici@ornek.com
 *
 * Bilgisayarda harbi/"E-posta Ayarla.bat" bilgileri sorup .env'e yazar ve bunu çağırır. .env, Next.js'in okuduğu
 * gibi okunur (@next/env: aynı tırnak ve $ kuralları). Şifre ekrana ya da kayda yazılmaz.
 */

import path from "node:path";
// Next.js'in kendi .env okuyucusu (next paketinin bağımlılığı; ayrı kurulum gerekmez)
import { loadEnvConfig } from "@next/env";

loadEnvConfig(path.resolve(__dirname, ".."), true, { info: () => {}, error: console.error });

/** SMTP hatası → ne yapılmalı (şifre içermez) */
function explain(message: string): string {
  if (/EAUTH|\b535\b|\b534\b|authentication|Username and Password not accepted/i.test(message)) {
    return "Kullanıcı adı ya da şifre kabul edilmedi. Gmail kullanıyorsanız normal şifreniz değil, Google hesabınızda oluşturduğunuz 16 harfli “Uygulama şifresi” gerekir (2 adımlı doğrulama açık olmalı). Hostinger'da e-posta hesabının şifresini hPanel → E-postalar'dan kontrol edin.";
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
    return "Sunucu adı bulunamadı: SMTP_HOST'u ve internet bağlantısını kontrol edin.";
  }
  if (/ETIMEDOUT|ECONNECTION|ECONNREFUSED|ESOCKET|timeout|Greeting never received/i.test(message)) {
    return "Sunucuya bağlanılamadı: SMTP_HOST / SMTP_PORT (465 ya da 587), internet bağlantısı ya da güvenlik duvarı.";
  }
  if (/\b55[0-4]\b|sender|from address|not owned|relay/i.test(message)) {
    return "Sunucu gönderen ya da alıcı adresini reddetti: EMAIL_FROM'daki adres SMTP_USER ile aynı olmalı; alıcı adresini kontrol edin.";
  }
  return "Ayrıntı yukarıda. Bilgileri kontrol edip E-posta Ayarla'yı yeniden çalıştırın.";
}

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

  const { deliver, maskEmail } = await import("../lib/email/transport");
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
    console.error(explain(message));
    process.exitCode = 1;
  }
}

void main();
