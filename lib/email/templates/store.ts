/**
 * İşletmeye giden bildirim e-postaları (yeni sipariş, ödeme uyarısı, iletişim mesajı, müşteri talebi,
 * onay bekleyen değerlendirme). Kısa ve işe dönük: ne oldu, ne yapılmalı, panelde nerede.
 */

import type { BusinessInfo } from "@/lib/business/info";
import { emailFooter, siteUrl } from "../brand";
import { button, keyValues, notice, paragraph, renderEmail, type Block, type KeyValueRow } from "../layout";
import type { RenderedEmail } from "./account";

function storeEmail(opts: {
  business: BusinessInfo;
  subject: string;
  preheader: string;
  eyebrow?: string;
  title: string;
  blocks: Block[];
}): RenderedEmail {
  const { html, text } = renderEmail({
    brandName: opts.business.tradeName,
    preheader: opts.preheader,
    eyebrow: opts.eyebrow,
    title: opts.title,
    blocks: opts.blocks,
    footer: emailFooter(opts.business, "Bu bildirim sitenizin yönetim sisteminden otomatik gönderildi."),
  });
  return { subject: opts.subject, html, text };
}

export function adminOrderUrl(orderId: string) {
  return `${siteUrl()}/admin/siparisler/${orderId}`;
}

export function paymentAlertEmail(opts: {
  business: BusinessInfo;
  title: string;
  message: string;
  orderId: string | null;
  reference: string | null;
}): RenderedEmail {
  const blocks: Block[] = [
    notice(opts.message, "danger", opts.title),
    paragraph(
      "Bu sipariş otomatik iptal edilmez ve para hareketi otomatik yapılmaz. Yönetim panelinde sipariş detayından durumu kontrol edin; gerekiyorsa iyzico panelinden işlem yapın."
    ),
  ];
  if (opts.orderId) blocks.push(button("Siparişi panelde aç", adminOrderUrl(opts.orderId)));
  return storeEmail({
    business: opts.business,
    subject: `Ödeme uyarısı: ${opts.title}${opts.reference ? ` — #${opts.reference}` : ""}`,
    preheader: opts.message,
    eyebrow: "Ödeme uyarısı",
    title: opts.title,
    blocks,
  });
}

export function newOrderStoreEmail(opts: {
  business: BusinessInfo;
  orderId: string;
  reference: string;
  customerName: string;
  totalText: string;
  methodLabel: string;
  statusNote: string;
  itemLines: string[];
  rows: KeyValueRow[];
}): RenderedEmail {
  return storeEmail({
    business: opts.business,
    subject: `Yeni sipariş #${opts.reference} — ${opts.totalText} (${opts.methodLabel})`,
    preheader: `${opts.customerName} · ${opts.totalText} · ${opts.statusNote}`,
    eyebrow: "Yeni sipariş",
    title: `${opts.customerName} sipariş verdi`,
    blocks: [
      notice(opts.statusNote, "info"),
      keyValues(
        [
          { label: "Sipariş no", value: `#${opts.reference}`, mono: true },
          { label: "Tutar", value: opts.totalText, strong: true },
          { label: "Ödeme", value: opts.methodLabel },
          ...opts.rows,
        ],
        { boxed: true }
      ),
      paragraph(opts.itemLines.join("\n")),
      button("Siparişi panelde aç", adminOrderUrl(opts.orderId)),
    ],
  });
}

export function contactMessageStoreEmail(opts: {
  business: BusinessInfo;
  name: string;
  email: string;
  phone: string;
  subjectLine: string;
  message: string;
  orderReference: string | null;
}): RenderedEmail {
  return storeEmail({
    business: opts.business,
    subject: `İletişim formu: ${opts.subjectLine}`,
    preheader: `${opts.name}: ${opts.message.slice(0, 120)}`,
    eyebrow: "İletişim formu",
    title: opts.subjectLine,
    blocks: [
      keyValues(
        [
          { label: "Gönderen", value: opts.name },
          { label: "E-posta", value: opts.email },
          { label: "Telefon", value: opts.phone },
          { label: "Sipariş no", value: opts.orderReference ? `#${opts.orderReference}` : "" },
        ],
        { boxed: true }
      ),
      paragraph(opts.message),
      paragraph("Bu e-postayı yanıtladığınızda yanıtınız doğrudan müşteriye gider.", { muted: true, small: true }),
      button("Mesajları panelde aç", `${siteUrl()}/admin/mesajlar`),
    ],
  });
}

export function customerRequestStoreEmail(opts: {
  business: BusinessInfo;
  orderId: string;
  reference: string;
  kindLabel: string;
  customerName: string;
  message: string;
}): RenderedEmail {
  return storeEmail({
    business: opts.business,
    subject: `${opts.kindLabel} — #${opts.reference}`,
    preheader: `${opts.customerName}: ${opts.message.slice(0, 120)}`,
    eyebrow: "Müşteri talebi",
    title: `${opts.kindLabel}: #${opts.reference}`,
    blocks: [
      keyValues([{ label: "Müşteri", value: opts.customerName }], { boxed: true }),
      paragraph(opts.message || "(Açıklama yazılmadı.)"),
      notice(
        "Cayma bildiriminde ödenen tutar bildirimden itibaren en geç 14 gün içinde iade edilmelidir. İadeyi yaptıktan sonra panelde iade kaydını girin; müşteriye e-posta otomatik gider.",
        "warn"
      ),
      button("Siparişi panelde aç", adminOrderUrl(opts.orderId)),
    ],
  });
}

export function reviewPendingStoreEmail(opts: {
  business: BusinessInfo;
  productName: string;
  rating: number;
  excerpt: string;
}): RenderedEmail {
  return storeEmail({
    business: opts.business,
    subject: `Onay bekleyen değerlendirme: ${opts.productName} (${opts.rating}/5)`,
    preheader: opts.excerpt.slice(0, 120),
    eyebrow: "Ürün değerlendirmesi",
    title: `${opts.productName} için yeni değerlendirme`,
    blocks: [
      paragraph(`Puan: ${"★".repeat(opts.rating)}${"☆".repeat(5 - opts.rating)}`),
      paragraph(opts.excerpt),
      button("Yorumları panelde aç", `${siteUrl()}/admin/yorumlar`),
    ],
  });
}
