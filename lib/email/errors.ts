/**
 * SMTP hatasını işletme sahibinin anlayacağı dile çevirir: ne oldu, ne yapılmalı. Yönetim paneli (deneme
 * e-postası, e-posta durumu), kuyruk ve bilgisayardaki "E-posta Ayarla" aynı metni kullanır.
 * Saf modül; şifre hiçbir mesajda yer almaz (nodemailer hata metninde şifre yoktur).
 */

/** Sunucu düzeyinde hata: tek bir e-postanın değil, ayarın sorunu */
export type SmtpFailureKind = "auth" | "connection";

/** Hata metninden tür (sunucu ya da e-posta kaynaklı değilse null) */
export function smtpFailureKind(message: string): SmtpFailureKind | null {
  if (/\bEAUTH\b|\b53[45][- ]|Username and Password not accepted|Authentication (credentials invalid|failed)|Invalid login/i.test(message)) {
    return "auth";
  }
  if (/\b(ECONNECTION|ETIMEDOUT|ESOCKET|EDNS|ETLS|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN)\b|getaddrinfo|Greeting never received|Connection timeout/i.test(message)) {
    return "connection";
  }
  return null;
}

export interface SmtpErrorContext {
  host: string;
  port?: number;
  user: string;
  /** Yayındaki site (bilgiler hPanel'de) mi, bu bilgisayar (E-posta Ayarla) mı */
  production: boolean;
  /** "E-posta Ayarla" içinden çağrıldı: şifre hemen orada yeniden sorulur */
  inSetup?: boolean;
}

const isGmail = (ctx: SmtpErrorContext) =>
  /(^|\.)(gmail|googlemail)\.com$/i.test(ctx.host) || /@(gmail|googlemail)\.com$/i.test(ctx.user);

/** Hata → Türkçe açıklama ve yapılacak iş */
export function explainSmtpError(message: string, ctx: SmtpErrorContext): string {
  const where = ctx.inSetup
    ? "aşağıda yeniden girin"
    : ctx.production
      ? "hPanel'deki ortam değişkenlerinde (SMTP_PASS) güncelleyin"
      : "harbi klasöründeki “E-posta Ayarla”yı yeniden çalıştırıp girin";
  const kind = smtpFailureKind(message);
  if (kind === "auth") {
    if (isGmail(ctx)) {
      return (
        `Gmail, ${ctx.user} hesabının şifresini kabul etmedi. Gmail, siteler için normal Google şifresini kabul etmez; ` +
        `“uygulama şifresi” ister. Bu Google hesabında 2 adımlı doğrulamayı açın, myaccount.google.com/apppasswords ` +
        `sayfasında bir uygulama şifresi oluşturun (16 harf) ve onu ${where}.`
      );
    }
    return (
      `E-posta sunucusu ${ctx.user} hesabının kullanıcı adını ya da şifresini kabul etmedi. Hostinger e-postasıysa ` +
      `şifreyi hPanel → E-postalar'dan kontrol edin (gerekirse yenileyin) ve ${where}.`
    );
  }
  if (kind === "connection") {
    return (
      `E-posta sunucusuna (${ctx.host}${ctx.port ? `:${ctx.port}` : ""}) bağlanılamadı: sunucu adını, portu (465 ya da 587) ` +
      `ve internet bağlantısını kontrol edin. Kısa süreli bir kesintiyse kendiliğinden düzelir.`
    );
  }
  if (/\b55[0-4]\b/.test(message) && /sender|from address|not owned|send as|relay|5\.7\.1/i.test(message)) {
    return "Sunucu gönderen adresi reddetti: gönderen adres, e-posta hesabının kendi adresi olmalı.";
  }
  if (/\b55[0-3]\b|5\.1\.[0-9]|user unknown|no such user|does not exist|recipient/i.test(message)) {
    return "Alıcı adresi yok ya da e-postayı kabul etmiyor: adresi kontrol edin.";
  }
  return "E-posta gönderilemedi. Ayrıntı aşağıda; bilgileri kontrol edip yeniden deneyin.";
}
