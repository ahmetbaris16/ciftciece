/**
 * E-posta tasarımı — tüm e-posta istemcilerinde (Gmail, Outlook, Apple Mail, telefon) okunur:
 * tablo düzeni, satır içi stil, en fazla 600 px, harici CSS/yazı tipi/görsel yok (görseller kapalıyken de
 * eksiksiz görünür). Her blok HTML ve düz metin karşılığını birlikte üretir (düz metin sürümü de gönderilir).
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
  olive: "#2f3b1f",
  oliveSoft: "#eef1e4",
  gold: "#9a7b2f",
  goldSoft: "#f7f0de",
  danger: "#9b2c2c",
  dangerSoft: "#fbeaea",
  success: "#2f6b3a",
  successSoft: "#e8f3ea",
};

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

// ── Bloklar ──────────────────────────────────────────────────────────────

export function paragraph(text: string, opts: { muted?: boolean; small?: boolean } = {}): Block {
  const size = opts.small ? 13 : 15;
  const color = opts.muted ? COLORS.muted : COLORS.body;
  return {
    html: `<p style="margin:0 0 14px;font-family:${FONT};font-size:${size}px;line-height:1.65;color:${color}">${nl2br(text)}</p>`,
    text: text,
  };
}

export function heading(text: string): Block {
  return {
    html: `<h2 style="margin:26px 0 10px;font-family:${SERIF};font-size:18px;line-height:1.35;font-weight:600;color:${COLORS.ink}">${esc(text)}</h2>`,
    text: `\n${text.toUpperCase()}\n${"-".repeat(Math.min(text.length, 60))}`,
  };
}

export function button(label: string, url: string): Block {
  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 22px"><tr><td style="border-radius:999px;background:${COLORS.olive}">
<a href="${esc(url)}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">${esc(label)}</a>
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
<td style="background:${t.bg};border:1px solid ${t.border};border-radius:12px;padding:14px 16px;font-family:${FONT};font-size:14px;line-height:1.6;color:${t.color}">
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

/** Etiket–değer listesi (IBAN, sipariş bilgileri) */
export function keyValues(rows: KeyValueRow[], opts: { boxed?: boolean } = {}): Block {
  const visible = rows.filter((r) => r.value);
  const cells = visible
    .map((r, i) => {
      const border = i < visible.length - 1 ? `border-bottom:1px solid ${COLORS.line};` : "";
      const valueStyle = `font-family:${r.mono ? "'SFMono-Regular',Consolas,'Courier New',monospace" : FONT};font-size:${r.mono ? 14 : 15}px;${r.strong ? "font-weight:700;" : ""}color:${COLORS.ink};letter-spacing:${r.mono ? "0.02em" : "0"}`;
      return `<tr>
<td style="${border}padding:10px 0;font-family:${FONT};font-size:13px;color:${COLORS.muted};vertical-align:top;width:38%">${esc(r.label)}</td>
<td style="${border}padding:10px 0;${valueStyle};vertical-align:top;word-break:break-word">${nl2br(r.value)}</td>
</tr>`;
    })
    .join("");
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cells}</table>`;
  return {
    html: opts.boxed
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr><td style="border:1px solid ${COLORS.line};border-radius:12px;padding:6px 16px;background:#fcfbf8">${table}</td></tr></table>`
      : `<div style="margin:4px 0 16px">${table}</div>`,
    text: visible.map((r) => `${r.label}: ${r.value}`).join("\n"),
  };
}

export interface SummaryLine {
  name: string;
  detail?: string;
  amount: string;
}

export interface SummaryTotal {
  label: string;
  amount: string;
  strong?: boolean;
  note?: string;
}

/** Sipariş özeti: kalemler + ara toplamlar */
export function orderSummary(lines: SummaryLine[], totals: SummaryTotal[]): Block {
  const itemRows = lines
    .map(
      (l) => `<tr>
<td style="padding:12px 0;border-bottom:1px solid ${COLORS.line};font-family:${FONT};vertical-align:top">
<span style="display:block;font-size:15px;color:${COLORS.ink};font-weight:600">${esc(l.name)}</span>
${l.detail ? `<span style="display:block;margin-top:2px;font-size:13px;color:${COLORS.muted}">${esc(l.detail)}</span>` : ""}
</td>
<td align="right" style="padding:12px 0 12px 12px;border-bottom:1px solid ${COLORS.line};font-family:${FONT};font-size:15px;color:${COLORS.ink};white-space:nowrap;vertical-align:top">${esc(l.amount)}</td>
</tr>`
    )
    .join("");
  const totalRows = totals
    .map(
      (t) => `<tr>
<td style="padding:${t.strong ? "12px" : "6px"} 0 ${t.note ? "0" : t.strong ? "4px" : "6px"};font-family:${FONT};font-size:${t.strong ? 16 : 14}px;${t.strong ? `font-weight:700;color:${COLORS.ink};border-top:2px solid ${COLORS.ink};` : `color:${COLORS.body};`}">${esc(t.label)}</td>
<td align="right" style="padding:${t.strong ? "12px" : "6px"} 0 ${t.note ? "0" : t.strong ? "4px" : "6px"} 12px;font-family:${FONT};font-size:${t.strong ? 16 : 14}px;white-space:nowrap;${t.strong ? `font-weight:700;color:${COLORS.ink};border-top:2px solid ${COLORS.ink};` : `color:${COLORS.body};`}">${esc(t.amount)}</td>
</tr>${t.note ? `<tr><td colspan="2" style="padding:2px 0 6px;font-family:${FONT};font-size:12px;color:${COLORS.muted}">${esc(t.note)}</td></tr>` : ""}`
    )
    .join("");
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px">${itemRows}<tr><td colspan="2" style="height:6px"></td></tr>${totalRows}</table>`,
    text: [
      ...lines.map((l) => `- ${l.name}${l.detail ? ` (${l.detail})` : ""}: ${l.amount}`),
      "",
      ...totals.map((t) => `${t.label}: ${t.amount}${t.note ? ` — ${t.note}` : ""}`),
    ].join("\n"),
  };
}

/** Sipariş adımları: tamamlananlar işaretli, sıradaki vurgulu */
export function progressSteps(steps: string[], currentIndex: number): Block {
  const cells = steps
    .map((label, i) => {
      const done = i < currentIndex;
      const active = i === currentIndex;
      const dot = done
        ? `<span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:50%;background:${COLORS.olive};color:#fff;font-size:12px;font-weight:700">&#10003;</span>`
        : active
          ? `<span style="display:inline-block;width:22px;height:22px;line-height:20px;border-radius:50%;border:2px solid ${COLORS.olive};background:#fff;color:${COLORS.olive};font-size:12px;font-weight:700">${i + 1}</span>`
          : `<span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:50%;background:${COLORS.line};color:${COLORS.muted};font-size:12px;font-weight:700">${i + 1}</span>`;
      const color = done || active ? COLORS.ink : COLORS.muted;
      return `<td align="center" style="padding:0 2px;font-family:${FONT};vertical-align:top;width:${Math.floor(100 / steps.length)}%">${dot}<span style="display:block;margin-top:6px;font-size:11px;line-height:1.3;color:${color};${active ? "font-weight:700;" : ""}">${esc(label)}</span></td>`;
    })
    .join("");
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 22px;text-align:center"><tr>${cells}</tr></table>`,
    text: steps.map((s, i) => `${i < currentIndex ? "[x]" : i === currentIndex ? "[>]" : "[ ]"} ${s}`).join("  "),
  };
}

/** Uzun metin (sözleşme): küçük punto, başlıklı bölümler */
export function legalText(title: string, sections: Array<{ heading?: string; paragraphs: string[] }>): Block {
  const body = sections
    .map(
      (s) =>
        `${s.heading ? `<p style="margin:14px 0 6px;font-family:${FONT};font-size:13px;font-weight:700;color:${COLORS.ink}">${esc(s.heading)}</p>` : ""}${s.paragraphs
          .map((p) => `<p style="margin:0 0 8px;font-family:${FONT};font-size:13px;line-height:1.6;color:${COLORS.body}">${nl2br(p)}</p>`)
          .join("")}`
    )
    .join("");
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 18px"><tr><td style="border:1px solid ${COLORS.line};border-radius:12px;padding:16px 18px;background:#fcfbf8">
<p style="margin:0 0 4px;font-family:${SERIF};font-size:16px;font-weight:600;color:${COLORS.ink}">${esc(title)}</p>${body}</td></tr></table>`,
    text: [
      `\n=== ${title.toUpperCase()} ===`,
      ...sections.map((s) => [s.heading ? `\n${s.heading}` : "", ...s.paragraphs].filter(Boolean).join("\n")),
    ].join("\n"),
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
  /** Başlığın üstündeki küçük etiket (ör. "Sipariş #…") */
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
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page}"><tr><td align="center" style="padding:28px 12px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td align="center" style="padding:4px 0 20px">
<span style="font-family:${SERIF};font-size:24px;letter-spacing:0.18em;color:${COLORS.olive};font-weight:600">${esc(input.brandName.toLocaleUpperCase("tr-TR"))}</span>
<span style="display:block;margin-top:4px;font-family:${FONT};font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${COLORS.gold}">Orhangazi &middot; Zeytin &amp; Zeytinyağı</span>
</td></tr>
<tr><td style="background:${COLORS.card};border-radius:18px;padding:34px 30px 26px;border:1px solid ${COLORS.line}">
${input.eyebrow ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${COLORS.gold};font-weight:600">${esc(input.eyebrow)}</p>` : ""}
<h1 style="margin:0 0 16px;font-family:${SERIF};font-size:26px;line-height:1.25;font-weight:600;color:${COLORS.ink}">${esc(input.title)}</h1>
${content}
</td></tr>
<tr><td align="center" style="padding:22px 18px 0;font-family:${FONT};font-size:12px;line-height:1.7;color:${COLORS.muted}">
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
