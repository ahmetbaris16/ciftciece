/**
 * E-posta tasarımı — tüm e-posta istemcilerinde (Gmail, Outlook, Apple Mail, telefon) okunur:
 * tablo düzeni, satır içi stil, en fazla 600 px, harici CSS/yazı tipi yok. Görseller: logo e-postanın içine gömülür
 * (lib/email/transport.ts); ürün görselleri yalnız site internetten erişilebilirken siteden gelir. Görseller
 * kapalıyken de e-posta eksiksiz okunur. Her blok HTML ve düz metin karşılığını birlikte üretir (düz metin sürümü
 * de gönderilir).
 *
 * Sade düzen (kullanıcı isteği 2026-10-13): üstte logo, kısa açıklama, ürünler, tutar, adres. Uzun metinler
 * (sözleşmeler) e-postanın gövdesinde değil ekinde.
 *
 * GÜVENLİK: Müşteriden gelen her metin (ad, adres, not) esc() ile kaçışlanır. Ham HTML yalnız bu dosyadaki
 * bloklardan gelir.
 */

export interface Block {
  html: string;
  text: string;
}

export const COLORS = {
  page: "#f4f1ea",
  card: "#ffffff",
  ink: "#23221e",
  body: "#3a3832",
  muted: "#7a766c",
  line: "#e7e2d6",
  soft: "#fbfaf6",
  olive: "#2f3b1f",
  oliveSoft: "#eef1e4",
  gold: "#9a7b2f",
  goldSoft: "#f7f0de",
  danger: "#9b2c2c",
  dangerSoft: "#fbeaea",
  success: "#2f6b3a",
  successSoft: "#e8f3ea",
};

/** Logo: public/email/logo.png (400×156, yüksek çözünürlüklü ekranlar için 2 kat); gönderirken e-postaya gömülür */
export const EMAIL_LOGO = { cid: "logo@ciftciece", publicPath: "/email/logo.png", width: 200, height: 78 };

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

export function esc(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Metindeki satır sonlarını <br> yapar (kaçışlanmış metin üzerinde) */
const nl2br = (s: string) => esc(s).replace(/\r?\n/g, "<br>");

/** Paragraf parçası: düz metin, kalın yazılacak kısım (ör. sipariş numarası) ya da bağlantı */
export type Inline = string | { strong: string } | { link: string; href: string };

function inlineHtml(parts: Inline[]): string {
  return parts
    .map((p) => {
      if (typeof p === "string") return nl2br(p);
      if ("strong" in p) return `<strong style="font-weight:700;color:${COLORS.ink}">${nl2br(p.strong)}</strong>`;
      return `<a href="${esc(p.href)}" style="color:${COLORS.olive};text-decoration:underline">${esc(p.link)}</a>`;
    })
    .join("");
}

function inlineText(parts: Inline[]): string {
  return parts
    .map((p) => (typeof p === "string" ? p : "strong" in p ? p.strong : `${p.link} (${p.href})`))
    .join("");
}

// ── Bloklar ──────────────────────────────────────────────────────────────

export function paragraph(content: string | Inline[], opts: { muted?: boolean; small?: boolean } = {}): Block {
  const parts = typeof content === "string" ? [content] : content;
  const size = opts.small ? 13 : 15;
  const color = opts.muted ? COLORS.muted : COLORS.body;
  return {
    html: `<p style="margin:0 0 14px;font-family:${FONT};font-size:${size}px;line-height:1.6;color:${color}">${inlineHtml(parts)}</p>`,
    text: inlineText(parts),
  };
}

export function heading(text: string): Block {
  return {
    html: `<h2 style="margin:24px 0 10px;font-family:${SERIF};font-size:17px;line-height:1.35;font-weight:600;color:${COLORS.ink}">${esc(text)}</h2>`,
    // Türkçe büyük harf (i → İ): düz metin sürümünde "SİPARİŞ ÖZETİ", "SIPARIŞ" değil
    text: `\n${text.toLocaleUpperCase("tr-TR")}\n${"-".repeat(Math.min(text.length, 60))}`,
  };
}

export function button(label: string, url: string): Block {
  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 20px"><tr><td style="border-radius:999px;background:${COLORS.olive}">
<a href="${esc(url)}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">${esc(label)}</a>
</td></tr></table>`,
    text: `${label}: ${url}`,
  };
}

export type Tone = "info" | "warn" | "success" | "danger";

const TONES: Record<Tone, { bg: string; border: string; color: string }> = {
  info: { bg: COLORS.oliveSoft, border: "#d5dcc0", color: COLORS.olive },
  warn: { bg: COLORS.goldSoft, border: "#eadcb4", color: "#6e5517" },
  success: { bg: COLORS.successSoft, border: "#c9e3cd", color: COLORS.success },
  danger: { bg: COLORS.dangerSoft, border: "#efcaca", color: COLORS.danger },
};

export function notice(text: string, tone: Tone = "info", title?: string): Block {
  const t = TONES[tone];
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr>
<td style="background:${t.bg};border:1px solid ${t.border};border-radius:12px;padding:12px 16px;font-family:${FONT};font-size:14px;line-height:1.6;color:${t.color}">
${title ? `<strong style="display:block;margin-bottom:4px">${esc(title)}</strong>` : ""}${nl2br(text)}
</td></tr></table>`,
    text: `${title ? `${title}: ` : ""}${text}`,
  };
}

export interface KeyValueRow {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
}

/**
 * Etiket–değer listesi (IBAN, kargo takip). stacked: etiket üstte, değer altta (adres gibi uzun değerler telefonda
 * dar sütuna sıkışmasın).
 */
export function keyValues(rows: KeyValueRow[], opts: { boxed?: boolean; stacked?: boolean } = {}): Block {
  const visible = rows.filter((r) => r.value);
  const cells = visible
    .map((r, i) => {
      const border = i < visible.length - 1 ? `border-bottom:1px solid ${COLORS.line};` : "";
      const valueStyle = `font-family:${r.mono ? "'SFMono-Regular',Consolas,'Courier New',monospace" : FONT};font-size:${r.mono ? 14 : 15}px;line-height:1.5;${r.strong ? "font-weight:700;" : ""}color:${COLORS.ink};letter-spacing:${r.mono ? "0.02em" : "0"}`;
      if (opts.stacked) {
        return `<tr><td style="${border}padding:10px 0">
<span style="display:block;margin-bottom:3px;font-family:${FONT};font-size:13px;color:${COLORS.muted}">${esc(r.label)}</span>
<span style="display:block;${valueStyle};word-break:break-word">${nl2br(r.value)}</span>
</td></tr>`;
      }
      return `<tr>
<td style="${border}padding:10px 0;font-family:${FONT};font-size:13px;color:${COLORS.muted};vertical-align:top;width:38%">${esc(r.label)}</td>
<td style="${border}padding:10px 0;${valueStyle};vertical-align:top;word-break:break-word">${nl2br(r.value)}</td>
</tr>`;
    })
    .join("");
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cells}</table>`;
  return {
    html: opts.boxed
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr><td style="border:1px solid ${COLORS.line};border-radius:12px;padding:4px 16px;background:${COLORS.soft}">${table}</td></tr></table>`
      : `<div style="margin:4px 0 16px">${table}</div>`,
    text: visible.map((r) => `${r.label}: ${r.value.replace(/\n/g, ", ")}`).join("\n"),
  };
}

export interface ProductRow {
  name: string;
  /** Seçenek ve adet (ör. "1 L Cam × 2") */
  detail: string;
  /** Satır tutarı; yoksa yalnız ürün gösterilir (kargo, teslim e-postası) */
  amount?: string;
  /** İndirimden önceki tutar (üstü çizili) */
  amountBefore?: string;
  imageUrl?: string | null;
}

/** Ürünler: varsa küçük görsel, ad, seçenek × adet, tutar (açık zeminli kutuda) */
export function productList(rows: ProductRow[]): Block {
  const withImages = rows.some((r) => r.imageUrl);
  const cells = rows
    .map((r, i) => {
      const border = i < rows.length - 1 ? `border-bottom:1px solid ${COLORS.line};` : "";
      const image = withImages
        ? `<td width="68" style="${border}padding:12px 12px 12px 0;vertical-align:top;width:68px">${
            r.imageUrl
              ? `<img src="${esc(r.imageUrl)}" width="56" alt="" style="display:block;width:56px;height:auto;border:0;border-radius:8px">`
              : ""
          }</td>`
        : "";
      const amount = r.amount
        ? `<td align="right" style="${border}padding:12px 0 12px 12px;font-family:${FONT};font-size:15px;color:${COLORS.ink};white-space:nowrap;vertical-align:top">${
            r.amountBefore
              ? `<span style="display:block;font-size:12px;color:${COLORS.muted};text-decoration:line-through">${esc(r.amountBefore)}</span>`
              : ""
          }${esc(r.amount)}</td>`
        : "";
      return `<tr>${image}<td style="${border}padding:12px 0;font-family:${FONT};vertical-align:top">
<span style="display:block;font-size:15px;line-height:1.4;color:${COLORS.ink};font-weight:600">${esc(r.name)}</span>
<span style="display:block;margin-top:3px;font-size:13px;color:${COLORS.muted}">${esc(r.detail)}</span>
</td>${amount}</tr>`;
    })
    .join("");
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 16px"><tr><td style="border:1px solid ${COLORS.line};border-radius:12px;padding:0 16px;background:${COLORS.soft}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cells}</table>
</td></tr></table>`,
    text: rows.map((r) => `• ${r.name} — ${r.detail}${r.amount ? `: ${r.amount}` : ""}`).join("\n"),
  };
}

export interface SummaryTotal {
  label: string;
  amount: string;
  strong?: boolean;
  note?: string;
}

/** Tutar satırları (ürünler, indirim, kargo, toplam) */
export function totalsTable(totals: SummaryTotal[]): Block {
  const rows = totals
    .map((t) => {
      const pad = t.strong ? "10px 0 4px" : "4px 0";
      const style = t.strong
        ? `font-size:16px;font-weight:700;color:${COLORS.ink};border-top:1px solid ${COLORS.ink};`
        : `font-size:14px;color:${COLORS.body};`;
      return `<tr>
<td style="padding:${pad};font-family:${FONT};${style}">${esc(t.label)}</td>
<td align="right" style="padding:${pad};padding-left:12px;font-family:${FONT};white-space:nowrap;${style}">${esc(t.amount)}</td>
</tr>${t.note ? `<tr><td colspan="2" style="padding:0 0 6px;font-family:${FONT};font-size:12px;color:${COLORS.muted}">${esc(t.note)}</td></tr>` : ""}`;
    })
    .join("");
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">${rows}</table>`,
    text: totals.map((t) => `${t.label}: ${t.amount}${t.note ? ` — ${t.note}` : ""}`).join("\n"),
  };
}

/** Çerçeveli kısa bilgi kutusu (ör. "Sözleşmeleriniz bu e-postanın ekinde") */
export function infoBox(title: string, content: Inline[]): Block {
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 6px"><tr>
<td style="border:1px solid ${COLORS.line};border-radius:12px;padding:12px 16px;font-family:${FONT};font-size:13px;line-height:1.6;color:${COLORS.body}">
<strong style="display:block;margin-bottom:2px;font-size:14px;color:${COLORS.ink}">${esc(title)}</strong>${inlineHtml(content)}
</td></tr></table>`,
    text: `${title}: ${inlineText(content)}`,
  };
}

export function divider(): Block {
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px"><tr><td style="border-top:1px solid ${COLORS.line};font-size:0;line-height:0">&nbsp;</td></tr></table>`,
    text: "",
  };
}

// ── Sayfa ────────────────────────────────────────────────────────────────

export interface EmailFooter {
  /** Satıcı adı (unvan) */
  sellerName: string;
  /** Adres, telefon, e-posta satırları */
  lines: string[];
  /** Neden bu e-postayı aldığı */
  reason: string;
  siteUrl?: string;
}

export interface RenderInput {
  /** Gelen kutusunda konunun yanında görünen kısa önizleme */
  preheader: string;
  /** Başlığın üstündeki küçük etiket (işletme bildirimleri, ör. "Yeni sipariş") */
  eyebrow?: string;
  title: string;
  blocks: Block[];
  footer: EmailFooter;
  brandName: string;
}

export function renderEmail(input: RenderInput): { html: string; text: string } {
  const content = input.blocks.map((b) => b.html).join("\n");
  const footerLines = input.footer.lines.filter(Boolean).map(esc).join(" &middot; ");
  const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(input.title)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(input.preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page}"><tr><td align="center" style="padding:24px 12px 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td align="center" style="padding:0 0 18px">
<img src="cid:${EMAIL_LOGO.cid}" width="${EMAIL_LOGO.width}" height="${EMAIL_LOGO.height}" alt="${esc(input.brandName)}" style="display:block;width:${EMAIL_LOGO.width}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;font-family:${SERIF};font-size:24px;letter-spacing:0.12em;color:${COLORS.olive}">
</td></tr>
<tr><td style="background:${COLORS.card};border-radius:16px;padding:28px 24px 22px;border:1px solid ${COLORS.line}">
${input.eyebrow ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:13px;letter-spacing:0.02em;color:${COLORS.gold};font-weight:600">${esc(input.eyebrow)}</p>` : ""}
<h1 style="margin:0 0 16px;font-family:${SERIF};font-size:22px;line-height:1.3;font-weight:600;color:${COLORS.ink}">${esc(input.title)}</h1>
${content}
</td></tr>
<tr><td align="center" style="padding:20px 18px 0;font-family:${FONT};font-size:12px;line-height:1.7;color:${COLORS.muted}">
<strong style="color:${COLORS.body}">${esc(input.footer.sellerName)}</strong><br>${footerLines}
${input.footer.siteUrl ? `<br><a href="${esc(input.footer.siteUrl)}" style="color:${COLORS.olive};text-decoration:underline">${esc(input.footer.siteUrl.replace(/^https?:\/\//, ""))}</a>` : ""}
<br><span style="display:inline-block;margin-top:8px">${esc(input.footer.reason)}</span>
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    input.brandName.toLocaleUpperCase("tr-TR"),
    "",
    input.eyebrow ?? "",
    input.title,
    "",
    ...input.blocks.map((b) => b.text).filter((t) => t !== ""),
    "",
    "—",
    input.footer.sellerName,
    ...input.footer.lines.filter(Boolean),
    input.footer.siteUrl ?? "",
    input.footer.reason,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { html, text };
}
