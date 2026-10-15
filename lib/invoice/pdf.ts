/**
 * Basit fatura PDF'i — "Siparişiniz teslim edildi" e-postasına eklenir (kullanıcı kararı 2026-10-15: "şimdilik basit
 * bir fatura, sonra halledeceğiz"; FINDINGS F-46).
 *
 * Bu belge siteden üretilir; GİB'e bildirilen resmî e-Arşiv fatura DEĞİLDİR (mali mühür, GİB numarası, karekod
 * yok). Belgenin altında bunu söyleyen not var (NOT_OFFICIAL). e-Arşiv entegrasyonu gelince bu belge ya kalkar ya da
 * entegratörün PDF'i eklenir.
 *
 * İçerik sipariş kaydının anlık görüntüsünden (sipariş kalemlerinin adı, fiyatı, KDV oranı) üretilir; ürün sonradan
 * değişse de belge değişmez. KDV oranı kalemde yoksa (ürüne girilmemiş) oran uydurulmaz: "—" yazılır ve KDV dökümü
 * verilmez. Tutarlar KDV dahildir (sitedeki fiyatlar gibi).
 *
 * Yazı tipi: Inter (SIL Open Font License, assets/fonts/Inter-OFL.txt). PDF'in standart yazı tiplerinde ğ, ş, ı, İ
 * yok; bu yüzden yazı tipi gömülür. Dosyalar Google Fonts'un `text=` alt kümesidir: ASCII, Latin-1, Latin Genişletilmiş-A
 * (Türkçe ve Avrupa dillerindeki adlar), Ə ə ve – — ‘ ’ “ ” • … € ₺ − № (~58 KB). Kümede olmayan harf "?" yazılır.
 * pdf-lib'in kendi alt küme üretimi (subset: true) bu yazı tipinde harfleri kaybediyor (denendi 2026-10-15); dosya
 * olduğu gibi gömülür. OpenType bağlamsal değişimleri kapalı: açıkken sipariş numarasındaki "6x2" → "6×2" oluyordu.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { formatPhoneTr } from "@/lib/business/info";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment/methods";
import { EMAIL_LOGO } from "@/lib/email/layout";
import { formatPriceRaw } from "@/types";
import { itemDiscountKurus, type OrderEmailData } from "@/lib/notifications/order-data";

export const NOT_OFFICIAL = "Bu belge siparişinizin fatura bilgilerini gösterir; resmî e-Arşiv faturanın yerine geçmez.";

export const invoiceFileName = (reference: string) => `fatura-${reference}.pdf`;

// ── Sayfa ölçüleri (pt; A4) ve renkler ──────────────────────────────────────────

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const RIGHT = PAGE_W - MARGIN;
const BOTTOM = 64;

const INK = rgb(0.06, 0.06, 0.06);
const MUTED = rgb(0.42, 0.42, 0.4);
const LINE = rgb(0.84, 0.82, 0.78);
const GOLD = rgb(0.72, 0.58, 0.16);
const BAND = rgb(0.96, 0.95, 0.91);

// Ürün tablosu sütunları: ürün solda; diğerleri sağa yaslı (sağ kenarları)
const COL = { productRight: 300, qty: 340, unit: 425, vat: 470, total: RIGHT };

// ── Yazı tipi ve logo (bir kez okunur) ──────────────────────────────────────────

interface Assets {
  regular: Uint8Array;
  bold: Uint8Array;
  logo: Uint8Array | null;
}

let assets: Promise<Assets> | null = null;

function loadAssets(): Promise<Assets> {
  assets ??= (async () => {
    const dir = path.join(process.cwd(), "assets", "fonts");
    const [regular, bold] = await Promise.all([readFile(path.join(dir, "Inter-Regular.ttf")), readFile(path.join(dir, "Inter-Bold.ttf"))]);
    // Logo yoksa belge logosuz üretilir (yazı tipi yoksa üretilemez: hata yukarı çıkar, e-posta yeniden denenir)
    const logo = await readFile(path.join(process.cwd(), "public", EMAIL_LOGO.publicPath)).catch((err: Error) => {
      console.error("[fatura] Logo okunamadı, belge logosuz üretilecek:", err.message);
      return null;
    });
    return { regular, bold, logo };
  })().catch((err) => {
    assets = null; // bir sonraki deneme dosyayı yeniden okusun
    throw err;
  });
  return assets;
}

// ── Biçimlendirme ───────────────────────────────────────────────────────────────

const money = (kurus: number) => `${formatPriceRaw(kurus)} TL`;

const dateTr = (d: Date) =>
  new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" }).format(d);

const vatLabel = (bps: number | null) => (bps === null ? "—" : `%${bps / 100}`);

/** Satır tutarının içindeki KDV (tutarlar KDV dahil): tutar × oran / (1 + oran), kuruşa yuvarlı */
export function includedVatKurus(grossKurus: number, bps: number): number {
  return Math.round((grossKurus * bps) / (10_000 + bps));
}

/**
 * KDV dökümü (oran → tutara dahil KDV). Yalnız bütün kalemlerin oranı biliniyorsa ve sipariş geneli indirim yoksa
 * (indirimin oranlara dağılımı belirsiz); aksi hâlde null — döküm verilmez.
 */
export function vatBreakdown(d: Pick<OrderEmailData, "items" | "discountKurus">): Array<{ bps: number; vatKurus: number }> | null {
  if (d.discountKurus > 0 || d.items.length === 0 || d.items.some((i) => i.vatRateBps === null)) return null;
  const byRate = new Map<number, number>();
  for (const i of d.items) byRate.set(i.vatRateBps!, (byRate.get(i.vatRateBps!) ?? 0) + i.lineTotalKurus);
  return [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([bps, gross]) => ({ bps, vatKurus: includedVatKurus(gross, bps) }));
}

// ── Çizim yardımcıları ──────────────────────────────────────────────────────────

/** Emoji, simgeler, yumuşak tire, sıfır genişlikli boşluk/birleştirici, değişim seçicileri */
const isSymbolOrInvisible = (cp: number) =>
  cp > 0xffff || cp === 0xad || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0xfe00 && cp <= 0xfe0f);

class Writer {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;

  constructor(
    private doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    private onNewPage: (w: Writer) => void
  ) {
    this.addPage();
  }

  private chars = new Map<PDFFont, Set<number>>();

  /**
   * Yazı tipinde olmayan harf "?" olur; emoji ve görünmez birleştiriciler atlanır; satır sonu ve denetim karakterleri
   * boşluk olur
   */
  clean(text: string, font: PDFFont): string {
    let set = this.chars.get(font);
    if (!set) {
      set = new Set(font.getCharacterSet());
      this.chars.set(font, set);
    }
    let out = "";
    for (const ch of text.replace(/[\u0000-\u001f\u007f]+/g, " ")) {
      const cp = ch.codePointAt(0)!;
      if (set.has(cp)) out += ch;
      else if (!isSymbolOrInvisible(cp)) out += "?";
    }
    return out.replace(/ {2,}/g, " ");
  }

  width(text: string, size: number, font = this.regular) {
    return font.widthOfTextAtSize(this.clean(text, font), size);
  }

  addPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = PAGE_H - MARGIN;
    if (this.pages.length > 1) this.onNewPage(this);
  }

  /** Aşağıda `height` kadar yer yoksa yeni sayfa */
  ensure(height: number) {
    if (this.y - height < BOTTOM) this.addPage();
  }

  text(text: string, x: number, y: number, opts: { size?: number; font?: PDFFont; color?: RGB; align?: "left" | "right" } = {}) {
    const size = opts.size ?? 9;
    const font = opts.font ?? this.regular;
    const t = this.clean(text, font);
    const left = opts.align === "right" ? x - font.widthOfTextAtSize(t, size) : x;
    this.page.drawText(t, { x: left, y, size, font, color: opts.color ?? INK });
  }

  line(y: number, color: RGB = LINE, thickness = 0.6, from = MARGIN, to = RIGHT) {
    this.page.drawLine({ start: { x: from, y }, end: { x: to, y }, thickness, color });
  }

  /** Metni genişliğe göre satırlara böler; boşluksuz uzun kelime harf harf bölünür */
  wrap(text: string, maxWidth: number, size: number, font = this.regular): string[] {
    const words = this.clean(text, font).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    const fits = (s: string) => font.widthOfTextAtSize(s, size) <= maxWidth;
    for (let word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (fits(candidate)) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      while (!fits(word)) {
        let cut = word.length - 1;
        while (cut > 1 && !fits(word.slice(0, cut))) cut--;
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      current = word;
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  }
}

// ── Belge ───────────────────────────────────────────────────────────────────────

export interface InvoiceOptions {
  /** Belge tarihi (fatura tarihi girilmişse o; yoksa üretildiği an — teslim) */
  issuedAt: Date;
}

function sellerLines(d: OrderEmailData): string[] {
  const b = d.business;
  const name = b.legalName.trim() || b.tradeName.trim();
  const tax = [b.taxOffice && `Vergi dairesi: ${b.taxOffice}`, b.taxNumber && `${b.taxNumber.length === 11 ? "TCKN" : "VKN"}: ${b.taxNumber}`]
    .filter(Boolean)
    .join("   ");
  return [
    name,
    b.legalName.trim() && b.tradeName.trim() && b.tradeName.trim() !== name ? b.tradeName.trim() : "",
    b.address,
    tax,
    b.mersisNo ? `MERSİS: ${b.mersisNo}` : "",
    b.phone ? `Tel: ${formatPhoneTr(b.phone)}` : "",
    b.email ? `E-posta: ${b.email}` : "",
  ].filter((l): l is string => Boolean(l && l.trim()));
}

function buyerLines(d: OrderEmailData): string[] {
  const billing = d.billing;
  const a = d.address;
  const shippingPlace = [a?.district, a?.city].filter(Boolean).join(" / ") + (a?.postalCode ? ` ${a.postalCode}` : "");
  const ownAddress = billing && !billing.sameAsShipping && billing.address?.trim();
  const addressPart = ownAddress
    ? [billing!.address!, [billing!.district, billing!.city].filter(Boolean).join(" / ")]
    : [a?.address ?? "", shippingPlace];
  const head =
    billing?.type === "CORPORATE"
      ? [
          billing.companyName ?? "",
          [billing.taxOffice && `Vergi dairesi: ${billing.taxOffice}`, billing.taxNumber && `VKN/TCKN: ${billing.taxNumber}`]
            .filter(Boolean)
            .join("   "),
        ]
      : [billing?.name?.trim() || d.customerName];
  return [
    ...head,
    ...addressPart,
    d.phone ? `Tel: ${formatPhoneTr(d.phone)}` : "",
    d.customerEmail ? `E-posta: ${d.customerEmail}` : "",
  ].filter((l) => Boolean(l && l.trim()));
}

function drawTableHeader(w: Writer) {
  const top = w.y;
  w.page.drawRectangle({ x: MARGIN, y: top - 20, width: RIGHT - MARGIN, height: 20, color: BAND });
  const y = top - 13.5;
  const o = { size: 8, font: w.bold, color: MUTED };
  w.text("Ürün", MARGIN + 8, y, o);
  w.text("Adet", COL.qty, y, { ...o, align: "right" });
  w.text("Birim fiyat", COL.unit, y, { ...o, align: "right" });
  w.text("KDV", COL.vat, y, { ...o, align: "right" });
  w.text("Tutar", COL.total - 8, y, { ...o, align: "right" });
  w.y = top - 20;
}

/** Siparişin fatura PDF'i (bayt). Yazı tipi okunamazsa hata fırlatır. */
export async function renderInvoicePdf(d: OrderEmailData, opts: InvoiceOptions): Promise<Uint8Array> {
  const files = await loadAssets();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const plain = { subset: false, features: { calt: false, liga: false, dlig: false, case: false } };
  const [regular, bold] = await Promise.all([doc.embedFont(files.regular, plain), doc.embedFont(files.bold, plain)]);
  let logo: PDFImage | null = null;
  if (files.logo) logo = await doc.embedPng(files.logo);

  const sellerName = d.business.legalName.trim() || d.business.tradeName.trim();
  doc.setTitle(`Fatura — Sipariş ${d.reference}`);
  doc.setAuthor(sellerName);
  doc.setSubject(`Sipariş ${d.reference}`);
  doc.setCreator(d.business.tradeName);
  doc.setProducer(d.business.tradeName);
  doc.setCreationDate(opts.issuedAt);
  doc.setModificationDate(opts.issuedAt);
  doc.setLanguage("tr-TR");

  // Sonraki sayfalarda tablo başlığı tekrar edilir
  let inTable = false;
  const w = new Writer(doc, regular, bold, (writer) => {
    writer.text(`Sipariş ${d.reference} — devamı`, MARGIN, writer.y - 8, { size: 8, color: MUTED });
    writer.y -= 22;
    if (inTable) drawTableHeader(writer);
  });

  // Üst: logo solda, başlık ve belge bilgileri sağda
  const top = w.y;
  if (logo) {
    const width = 120;
    const height = (width * logo.height) / logo.width;
    w.page.drawImage(logo, { x: MARGIN, y: top - height, width, height });
  } else {
    w.text(d.business.tradeName, MARGIN, top - 18, { size: 16, font: bold });
  }
  w.text("FATURA", RIGHT, top - 20, { size: 22, font: bold, align: "right" });
  const meta: Array<[string, string]> = [
    ...(d.invoiceNumber ? ([["Fatura no", d.invoiceNumber]] as Array<[string, string]>) : []),
    ["Tarih", dateTr(opts.issuedAt)],
    ["Sipariş no", d.reference],
    ["Sipariş tarihi", dateTr(d.createdAt)],
    ["Ödeme", PAYMENT_METHOD_LABELS[d.paymentMethod]],
  ];
  let my = top - 42;
  for (const [label, value] of meta) {
    w.text(label, RIGHT - 215, my, { size: 8.5, color: MUTED });
    w.text(value, RIGHT, my, { size: 8.5, align: "right" });
    my -= 13;
  }
  w.y = Math.min(my, top - 72) - 10;
  w.line(w.y, GOLD, 1.2);
  w.y -= 22;

  // Satıcı ve alıcı yan yana
  const colW = (RIGHT - MARGIN - 24) / 2;
  const blocks: Array<{ x: number; title: string; lines: string[] }> = [
    { x: MARGIN, title: "SATICI", lines: sellerLines(d) },
    { x: MARGIN + colW + 24, title: "ALICI", lines: buyerLines(d) },
  ];
  let lowest = w.y;
  for (const b of blocks) {
    let y = w.y;
    w.text(b.title, b.x, y, { size: 7.5, font: bold, color: MUTED });
    y -= 15;
    b.lines.forEach((l, idx) => {
      for (const part of w.wrap(l, colW, 9, idx === 0 ? bold : regular)) {
        w.text(part, b.x, y, { size: 9, font: idx === 0 ? bold : regular });
        y -= 12.5;
      }
    });
    lowest = Math.min(lowest, y);
  }
  w.y = lowest - 14;

  // Ürün tablosu
  w.ensure(60);
  drawTableHeader(w);
  inTable = true;
  for (const item of d.items) {
    const nameLines = w.wrap(item.name, COL.productRight - MARGIN - 8, 9, bold);
    const detailLines = item.variant ? w.wrap(item.variant, COL.productRight - MARGIN - 8, 8) : [];
    const height = 10 + nameLines.length * 12 + detailLines.length * 11 + 4;
    w.ensure(height);
    let y = w.y - 16;
    const firstLine = y;
    for (const l of nameLines) {
      w.text(l, MARGIN + 8, y, { size: 9, font: bold });
      y -= 12;
    }
    for (const l of detailLines) {
      w.text(l, MARGIN + 8, y, { size: 8, color: MUTED });
      y -= 11;
    }
    w.text(String(item.quantity), COL.qty, firstLine, { size: 9, align: "right" });
    w.text(money(item.unitPriceKurus), COL.unit, firstLine, { size: 9, align: "right" });
    w.text(vatLabel(item.vatRateBps), COL.vat, firstLine, { size: 9, align: "right" });
    w.text(money(item.lineTotalKurus), COL.total - 8, firstLine, { size: 9, align: "right" });
    const full = item.unitPriceKurus * item.quantity;
    if (item.lineTotalKurus < full) {
      w.text(`İndirim −${money(full - item.lineTotalKurus)}`, COL.total - 8, firstLine - 11, { size: 7.5, color: MUTED, align: "right" });
      y = Math.min(y, firstLine - 11);
    }
    w.y = y - 4;
    w.line(w.y);
  }
  inTable = false;

  // Toplamlar (sağda)
  const itemDiscount = itemDiscountKurus(d);
  const rows: Array<{ label: string; value: string; strong?: boolean; muted?: boolean }> = [
    { label: "Ürünler", value: money(d.subtotalKurus + itemDiscount) },
  ];
  if (itemDiscount > 0) rows.push({ label: "İndirim", value: `−${money(itemDiscount)}` });
  if (d.discountKurus > 0) rows.push({ label: "İndirim", value: `−${money(d.discountKurus)}` });
  rows.push({
    label: `Kargo (${d.carrierName})`,
    value: d.recipientPaysShipping ? "Alıcı öder" : d.shippingKurus > 0 ? money(d.shippingKurus) : "Ücretsiz",
  });
  if (d.paymentFeeKurus > 0) rows.push({ label: "Kapıda ödeme bedeli", value: money(d.paymentFeeKurus) });
  rows.push({ label: "Toplam (KDV dahil)", value: money(d.totalKurus), strong: true });
  for (const v of vatBreakdown(d) ?? []) {
    rows.push({ label: `Tutara dahil KDV (%${v.bps / 100}, ürünler)`, value: money(v.vatKurus), muted: true });
  }

  const labelRight = RIGHT - 110;
  w.ensure(rows.length * 16 + 20);
  w.y -= 10;
  for (const r of rows) {
    const size = r.strong ? 11 : r.muted ? 8 : 9;
    if (r.strong) {
      w.y -= 7;
      w.line(w.y, INK, 0.8, labelRight - 120, RIGHT);
    }
    w.y -= r.strong ? 16 : 13;
    const font = r.strong ? bold : regular;
    const color = r.muted ? MUTED : INK;
    w.text(r.label, labelRight, w.y, { size, font, color, align: "right" });
    w.text(r.value, RIGHT - 8, w.y, { size, font, color, align: "right" });
    if (r.strong) w.y -= 6;
  }

  if (d.customerNote?.trim()) {
    w.y -= 18;
    const lines = w.wrap(`Sipariş notu: ${d.customerNote.trim()}`, RIGHT - MARGIN, 8.5);
    w.ensure(lines.length * 11 + 4);
    for (const l of lines) {
      w.text(l, MARGIN, w.y, { size: 8.5, color: MUTED });
      w.y -= 11;
    }
  }

  // Alt bilgi: her sayfada not ve sayfa numarası
  w.pages.forEach((page, i) => {
    page.drawLine({ start: { x: MARGIN, y: 44 }, end: { x: RIGHT, y: 44 }, thickness: 0.6, color: LINE });
    const note = w.clean(NOT_OFFICIAL, regular);
    page.drawText(note, { x: MARGIN, y: 32, size: 7.5, font: regular, color: MUTED });
    if (w.pages.length > 1) {
      const label = `Sayfa ${i + 1} / ${w.pages.length}`;
      page.drawText(label, { x: RIGHT - regular.widthOfTextAtSize(label, 7.5), y: 32, size: 7.5, font: regular, color: MUTED });
    }
  });

  return doc.save();
}
