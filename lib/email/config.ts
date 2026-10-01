/**
 * E-posta gönderim ayarları — ortam değişkenlerinden (Hostinger e-posta hesabı, SMTP).
 *
 *   SMTP_HOST   smtp.hostinger.com
 *   SMTP_PORT   465 (SSL) ya da 587 (STARTTLS)
 *   SMTP_USER   e-posta hesabının tam adresi (ör. siparis@alanadiniz.com)
 *   SMTP_PASS   e-posta hesabının şifresi
 *   EMAIL_FROM  Gönderen: "Çiftçi Ece <siparis@alanadiniz.com>" — adres SMTP_USER ile aynı olmalı
 *               (Hostinger başka adres adına gönderimi reddeder). Boşsa SMTP_USER kullanılır.
 *
 * Kip:
 *  - "smtp":       ayarlar tam; e-postalar gönderilir.
 *  - "dev-outbox": geliştirmede ayar yoksa e-posta gönderilmez, .mock-data/outbox.json'a yazılır.
 *  - "none":       canlıda ayar yok; e-postalar kuyrukta bekler (gönderilmez), admin panelinde uyarı çıkar.
 * Şifre hiçbir yerde loglanmaz/gösterilmez.
 */

export type EmailMode = "smtp" | "dev-outbox" | "none";

export interface SmtpConfig {
  host: string;
  port: number;
  /** 465: doğrudan TLS */
  secure: boolean;
  /** 587: STARTTLS zorunlu (şifre açık metin gitmesin) */
  requireTLS: boolean;
  user: string;
  pass: string;
  /** Gönderen adı + adresi */
  fromName: string;
  fromAddress: string;
}

type Env = Record<string, string | undefined>;

// "örnek" gibi kelimeler gerçek alan adlarında geçebilir: yalnız açık yer tutucular yok sayılır
const isPlaceholder = (v: string | undefined) => !v || /todo|xxx|your_|changeme/i.test(v);

/** "Ad <adres>" ya da yalnız adres */
export function parseFromHeader(value: string): { name: string; address: string } | null {
  const v = value.trim();
  const m = /^(.*)<\s*([^<>\s]+@[^<>\s]+)\s*>$/.exec(v);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, ""), address: m[2].toLowerCase() };
  if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)) return { name: "", address: v.toLowerCase() };
  return null;
}

export function smtpConfigFromEnv(env: Env = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  if (isPlaceholder(host) || isPlaceholder(user) || !pass || isPlaceholder(pass)) return null;
  const port = Number(env.SMTP_PORT?.trim() || "465");
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  const from = parseFromHeader(env.EMAIL_FROM?.trim() || user!) ?? parseFromHeader(user!);
  if (!from) return null;
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE.trim() === "true" : port === 465;
  return {
    host: host!,
    port,
    secure,
    requireTLS: !secure && (env.SMTP_REQUIRE_TLS ? env.SMTP_REQUIRE_TLS.trim() === "true" : port === 587),
    user: user!,
    pass,
    fromName: from.name || "Çiftçi Ece",
    fromAddress: from.address,
  };
}

export function emailMode(env: Env = process.env): EmailMode {
  if (smtpConfigFromEnv(env)) return "smtp";
  return env.NODE_ENV === "production" ? "none" : "dev-outbox";
}

/** Admin paneli ve açılış denetimi için uyarılar (şifre içermez) */
export function emailConfigWarnings(env: Env = process.env): string[] {
  const warnings: string[] = [];
  const cfg = smtpConfigFromEnv(env);
  if (!cfg) {
    warnings.push(
      "E-posta gönderimi ayarlı değil (SMTP_HOST, SMTP_USER, SMTP_PASS): sipariş e-postaları kuyrukta bekler, müşteriye gitmez."
    );
    return warnings;
  }
  if (env.EMAIL_FROM && !parseFromHeader(env.EMAIL_FROM)) warnings.push("EMAIL_FROM biçimi geçersiz; SMTP_USER kullanılıyor.");
  if (cfg.fromAddress !== cfg.user.toLowerCase()) {
    warnings.push(
      `Gönderen adresi (${cfg.fromAddress}) SMTP hesabından (${cfg.user}) farklı; Hostinger bu e-postaları reddedebilir.`
    );
  }
  if (env.NODE_ENV === "production" && !cfg.secure && !cfg.requireTLS) {
    warnings.push("SMTP bağlantısı şifresiz (port 465 ya da 587 kullanın).");
  }
  return warnings;
}
