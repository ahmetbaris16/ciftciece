/**
 * Müşteri sipariş e-postaları. Her e-posta: ne oldu, şimdi ne olacak, sipariş özeti, sipariş sayfası bağlantısı.
 *
 * "Siparişiniz alındı" e-postası yasal teyittir (e-ticaret mevzuatı: sipariş gecikmeksizin teyit edilir) ve
 * Ön Bilgilendirme Formu ile Mesafeli Satış Sözleşmesi'nin siparişe özel hâlini içerir (kalıcı veri saklayıcısı).
 */

import { distanceSalesSections, preInformationSections, sectionsToParagraphs } from "@/lib/legal/content";
import { formatPhoneTr } from "@/lib/business/info";
import { formatPrice } from "@/types";
import { emailFooter, siteUrl } from "../brand";
import {
  button,
  divider,
  heading,
  keyValues,
  legalText,
  notice,
  orderSummary,
  paragraph,
  progressSteps,
  renderEmail,
  type Block,
  type SummaryTotal,
} from "../layout";
import type { RenderedEmail } from "./account";
import {
  addressText,
  billingText,
  formatIban,
  itemDiscountKurus,
  orderLegalContext,
  type OrderEmailData,
} from "@/lib/notifications/order-data";

const STEPS = ["Sipariş alındı", "Ödeme", "Hazırlanıyor", "Kargoda", "Teslim edildi"];

const dateTimeTr = (d: Date) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d);

export const orderUrl = (d: OrderEmailData) => `${siteUrl()}/siparis/${d.reference}`;

function totals(d: OrderEmailData): SummaryTotal[] {
  // İndirimli kalem varsa ürünler indirimsiz tutarla, indirim ayrı satırda (sepet ve ödemedeki gibi)
  const itemDiscount = itemDiscountKurus(d);
  const t: SummaryTotal[] = [{ label: "Ürünler", amount: formatPrice(d.subtotalKurus + itemDiscount) }];
  if (itemDiscount > 0) t.push({ label: "İndirim", amount: `−${formatPrice(itemDiscount)}` });
  if (d.discountKurus > 0) t.push({ label: "İndirim", amount: `−${formatPrice(d.discountKurus)}` });
  t.push({
    label: `Kargo (${d.carrierName})`,
    amount: d.recipientPaysShipping ? "Teslimatta" : d.shippingKurus > 0 ? formatPrice(d.shippingKurus) : "Ücretsiz",
    note: d.recipientPaysShipping ? "Kargo ücreti teslimatta kargo firmasına ödenir." : undefined,
  });
  if (d.paymentFeeKurus > 0) t.push({ label: "Kapıda ödeme bedeli", amount: formatPrice(d.paymentFeeKurus) });
  t.push({
    label: d.paymentMethod === "CASH_ON_DELIVERY" ? "Teslimatta ödenecek" : "Toplam (KDV dahil)",
    amount: formatPrice(d.totalKurus),
    strong: true,
  });
  return t;
}

function summary(d: OrderEmailData): Block {
  return orderSummary(
    d.items.map((i) => ({
      name: i.name,
      detail:
        i.lineTotalKurus < i.unitPriceKurus * i.quantity
          ? `${i.variant} × ${i.quantity} · indirimli (${formatPrice(i.unitPriceKurus * i.quantity)} yerine)`
          : `${i.variant} × ${i.quantity}`,
      amount: formatPrice(i.lineTotalKurus),
    })),
    totals(d)
  );
}

function deliveryBlock(d: OrderEmailData): Block {
  return keyValues(
    [
      { label: "Teslimat adresi", value: addressText(d.address) },
      { label: "Fatura", value: billingText(d.billing, d.customerName) },
      { label: "Sipariş notunuz", value: d.customerNote ?? "" },
    ],
    { boxed: true }
  );
}

function bankBlocks(d: OrderEmailData): Block[] {
  if (!d.bank) {
    return [
      notice(
        `Hesap bilgilerimizi size telefonla iletebiliriz: ${formatPhoneTr(d.business.phone)}. Sipariş numaranızı belirtmeniz yeterli.`,
        "warn"
      ),
    ];
  }
  const blocks: Block[] = [
    keyValues(
      [
        { label: "Banka", value: d.bank.bankName },
        { label: "Alıcı", value: d.bank.accountHolder },
        { label: "IBAN", value: formatIban(d.bank.iban), mono: true },
        { label: "Tutar", value: formatPrice(d.totalKurus), strong: true },
        { label: "Açıklama", value: d.reference, mono: true },
      ],
      { boxed: true }
    ),
  ];
  if (d.paymentDueAt) {
    blocks.push(
      notice(
        `Son ödeme: ${dateTimeTr(d.paymentDueAt)}. Açıklamaya sipariş numaranızı yazmayı unutmayın. Bu zamana kadar ödeme gelmezse sipariş kendiliğinden iptal olur.`,
        "warn",
        "Önemli"
      )
    );
  }
  return blocks;
}

function legalBlocks(d: OrderEmailData): Block[] {
  const ctx = orderLegalContext(d);
  return [
    divider(),
    heading("Sözleşme metinleriniz"),
    paragraph(
      "Siparişinizde onayladığınız Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi aşağıdadır. Bu e-postayı saklayın; metinlere sipariş sayfanızdan da ulaşabilirsiniz.",
      { muted: true, small: true }
    ),
    legalText("Ön Bilgilendirme Formu", sectionsToParagraphs(preInformationSections(d.business, ctx))),
    legalText("Mesafeli Satış Sözleşmesi", sectionsToParagraphs(distanceSalesSections(d.business, ctx))),
  ];
}

function customerEmail(
  d: OrderEmailData,
  opts: { subject: string; preheader: string; title: string; blocks: Block[]; reason?: string }
): RenderedEmail {
  const { html, text } = renderEmail({
    brandName: d.business.tradeName,
    preheader: opts.preheader,
    eyebrow: `Sipariş #${d.reference}`,
    title: opts.title,
    blocks: opts.blocks,
    footer: emailFooter(
      d.business,
      opts.reason ?? "Bu e-postayı sitemizden verdiğiniz sipariş hakkında bilgilendirme amacıyla aldınız."
    ),
  });
  return { subject: opts.subject, html, text };
}

const hello = (d: OrderEmailData) => paragraph(`Merhaba ${d.firstName},`);

// ── Sipariş alındı (yasal teyit + sözleşmeler) ───────────────────────────

export function orderReceivedEmail(d: OrderEmailData): RenderedEmail {
  const blocks: Block[] = [hello(d)];
  let title = "Siparişiniz alındı";
  let preheader = `Sipariş #${d.reference} — ${formatPrice(d.totalKurus)}`;
  let step = 1;

  if (d.paymentMethod === "BANK_TRANSFER" && d.status === "PENDING") {
    title = "Siparişiniz alındı — ödemenizi bekliyoruz";
    preheader = `Havale/EFT bilgileri: ${formatPrice(d.totalKurus)}, açıklama ${d.reference}`;
    blocks.push(
      paragraph(
        "Siparişinizi aldık ve ürünlerinizi sizin için ayırdık. Aşağıdaki hesaba havale/EFT yaptığınızda siparişiniz hazırlanmaya başlar; ödemeniz bize ulaşınca size ayrıca haber veririz."
      ),
      heading("Havale / EFT bilgileri"),
      ...bankBlocks(d)
    );
    step = 1;
  } else if (d.paymentMethod === "CASH_ON_DELIVERY") {
    blocks.push(
      paragraph(
        `Siparişiniz kesinleşti ve hazırlanıyor. Ödemeyi (${formatPrice(d.totalKurus)}) teslimatta kargo görevlisine yapacaksınız. Kargoya verdiğimizde takip numaranızı göndereceğiz.`
      )
    );
    step = 2;
  } else {
    title = "Ödemeniz alındı, siparişiniz hazırlanıyor";
    blocks.push(
      paragraph(
        "Ödemeniz onaylandı, teşekkür ederiz. Siparişinizi hazırlamaya başlıyoruz; kargoya verdiğimizde takip numaranızı e-postayla göndereceğiz."
      )
    );
    step = 2;
  }

  blocks.push(
    progressSteps(STEPS, step),
    heading("Sipariş özeti"),
    summary(d),
    deliveryBlock(d),
    button("Siparişi görüntüle", orderUrl(d)),
    paragraph(
      `Bir sorunuz mu var? Bu e-postayı yanıtlayabilir ya da ${formatPhoneTr(d.business.phone)} numarasından bize ulaşabilirsiniz.`,
      { muted: true, small: true }
    ),
    ...legalBlocks(d)
  );
  return customerEmail(d, {
    subject: `${title} — #${d.reference}`,
    preheader,
    title,
    blocks,
  });
}

// ── Ödeme alındı (havale onayı) ──────────────────────────────────────────

export function paymentReceivedEmail(d: OrderEmailData): RenderedEmail {
  return customerEmail(d, {
    subject: `Ödemeniz alındı — #${d.reference}`,
    preheader: `${formatPrice(d.totalKurus)} tutarındaki ödemeniz hesabımıza geçti.`,
    title: "Ödemeniz alındı",
    blocks: [
      hello(d),
      paragraph(
        `${formatPrice(d.totalKurus)} tutarındaki havale/EFT ödemeniz hesabımıza geçti, teşekkür ederiz. Siparişinizi hazırlamaya başlıyoruz; kargoya verdiğimizde takip numaranızı göndereceğiz.`
      ),
      progressSteps(STEPS, 2),
      summary(d),
      button("Siparişi görüntüle", orderUrl(d)),
    ],
  });
}

// ── Kargoya verildi ──────────────────────────────────────────────────────

export function orderShippedEmail(d: OrderEmailData, shipmentId: string, additional: boolean): RenderedEmail {
  const s = d.shipments.find((x) => x.id === shipmentId) ?? d.shipments[d.shipments.length - 1];
  const blocks: Block[] = [
    hello(d),
    paragraph(
      additional
        ? "Siparişinizin bir paketi daha kargoya verildi. Takip bilgileri aşağıda."
        : "Siparişiniz özenle paketlendi ve kargoya verildi. Kargo firmasının sayfasından takip edebilirsiniz."
    ),
  ];
  if (s) {
    blocks.push(
      keyValues(
        [
          { label: "Kargo firması", value: s.carrier },
          { label: "Takip numarası", value: s.trackingNumber, mono: true, strong: true },
        ],
        { boxed: true }
      )
    );
    if (s.link) blocks.push(button("Kargomu takip et", s.link));
    blocks.push(
      paragraph(
        "Takip sayfası numarayı kendiliğinden göstermezse takip numaranızı sayfadaki kutuya yazın. Kargo bilgilerinin sisteme düşmesi birkaç saat sürebilir.",
        { muted: true, small: true }
      )
    );
  }
  blocks.push(
    progressSteps(STEPS, 3),
    notice(
      "Paketi teslim alırken dışını kontrol edin; hasar varsa kargo görevlisine tutanak tutturup bize bildirin.",
      "info"
    )
  );
  if (d.paymentMethod === "CASH_ON_DELIVERY") {
    blocks.push(notice(`Teslimatta ödenecek tutar: ${formatPrice(d.totalKurus)}`, "warn"));
  }
  blocks.push(summary(d), button("Siparişi görüntüle", orderUrl(d)));
  return customerEmail(d, {
    subject: `Siparişiniz kargoya verildi — #${d.reference}`,
    preheader: s ? `${s.carrier} takip no: ${s.trackingNumber}` : "Siparişiniz yolda.",
    title: additional ? "Bir paketiniz daha yolda" : "Siparişiniz kargoya verildi",
    blocks,
  });
}

// ── Teslim edildi ───────────────────────────────────────────────────────

export function orderDeliveredEmail(d: OrderEmailData): RenderedEmail {
  return customerEmail(d, {
    subject: `Siparişiniz teslim edildi — #${d.reference}`,
    preheader: "Afiyet olsun! Görüşleriniz bizim için değerli.",
    title: "Siparişiniz teslim edildi",
    blocks: [
      hello(d),
      paragraph(
        "Siparişiniz teslim edildi; afiyet olsun! Ürünlerimizi beğendiyseniz değerlendirmeniz diğer müşterilerimize yol gösterir."
      ),
      progressSteps(STEPS, 5),
      button("Siparişi görüntüle ve değerlendir", `${orderUrl(d)}#degerlendir`),
      notice(
        "Bir sorun varsa (eksik, hasarlı ya da yanlış ürün) sipariş sayfanızdaki “İade / iptal” bölümünden ya da bu e-postayı yanıtlayarak bize bildirin. Teslimattan itibaren 14 gün içinde cayma hakkınızı kullanabilirsiniz (ambalajı açılmış gıda ürünleri hariç).",
        "info"
      ),
    ],
  });
}

// ── İptal ───────────────────────────────────────────────────────────────

export function orderCancelledEmail(
  d: OrderEmailData,
  opts: { expired: boolean; byCustomer: boolean; reason: string | null }
): RenderedEmail {
  const message = opts.expired
    ? d.paymentMethod === "BANK_TRANSFER"
      ? "Havale/EFT ödemeniz son ödeme zamanına kadar bize ulaşmadığı için siparişiniz iptal edildi ve ayrılan ürünler serbest bırakıldı. Ödeme yaptıysanız lütfen bize hemen ulaşın; sorunu birlikte çözelim."
      : "Kart ödemesi tamamlanmadığı için siparişiniz iptal edildi ve ayrılan ürünler serbest bırakıldı. Kartınızdan çekim yapıldığını görüyorsanız lütfen bize hemen ulaşın."
    : opts.byCustomer
      ? "İsteğiniz üzerine siparişiniz iptal edildi."
      : `Siparişiniz iptal edildi${opts.reason ? `: ${opts.reason}` : "."}`;
  return customerEmail(d, {
    subject: `Siparişiniz iptal edildi — #${d.reference}`,
    preheader: opts.expired ? "Ödeme süresi doldu." : "Siparişiniz iptal edildi.",
    title: "Siparişiniz iptal edildi",
    blocks: [
      hello(d),
      paragraph(message),
      summary(d),
      button("Alışverişe devam et", `${siteUrl()}/urunler`),
      paragraph(`Sorunuz için: ${formatPhoneTr(d.business.phone)}${d.business.email ? ` · ${d.business.email}` : ""}`, {
        muted: true,
        small: true,
      }),
    ],
  });
}

// ── İade ────────────────────────────────────────────────────────────────

const REFUND_METHOD_TEXT: Record<string, string> = {
  CARD_PROVIDER: "ödemede kullandığınız karta",
  BANK_TRANSFER: "banka hesabınıza",
  CASH: "elden",
  OTHER: "",
};

export function refundEmail(d: OrderEmailData, refundId: string): RenderedEmail {
  const r = d.refunds.find((x) => x.id === refundId);
  const amount = r ? formatPrice(r.amountKurus) : "";
  const where = r ? REFUND_METHOD_TEXT[r.method] ?? "" : "";
  const closed = d.status === "CANCELLED" || d.status === "REFUNDED";
  const lines: Block[] = [
    hello(d),
    paragraph(
      `${amount} tutarındaki iadeniz ${where ? `${where} ` : ""}yapıldı.${closed ? (d.status === "CANCELLED" ? " Siparişiniz iptal edildi." : " Siparişiniz iade edildi olarak kapatıldı.") : ""}`
    ),
  ];
  if (r?.method === "CARD_PROVIDER") {
    lines.push(
      notice("Kart iadelerinin hesap ekstrenize yansıması bankanıza göre birkaç iş günü sürebilir.", "info")
    );
  }
  lines.push(button("Siparişi görüntüle", orderUrl(d)));
  return customerEmail(d, {
    subject: `İadeniz yapıldı — #${d.reference}`,
    preheader: `${amount} iade edildi.`,
    title: "İadeniz yapıldı",
    blocks: lines,
  });
}

// ── Havale hatırlatma ───────────────────────────────────────────────────

export function transferReminderEmail(d: OrderEmailData): RenderedEmail {
  return customerEmail(d, {
    subject: `Havale ödemenizi bekliyoruz — #${d.reference}`,
    preheader: d.paymentDueAt ? `Son ödeme: ${dateTimeTr(d.paymentDueAt)}` : "Siparişiniz sizin için ayrıldı.",
    title: "Siparişiniz sizi bekliyor",
    blocks: [
      hello(d),
      paragraph(
        "Siparişiniz için ayırdığımız ürünler hâlâ sizi bekliyor, ancak ödemeniz henüz hesabımıza ulaşmadı. Ödemeyi yaptıysanız bu e-postayı dikkate almayın; geçmesi biraz sürebilir."
      ),
      ...bankBlocks(d),
      button("Siparişi görüntüle", orderUrl(d)),
      paragraph("Vazgeçtiyseniz sipariş sayfanızdan iptal edebilirsiniz.", { muted: true, small: true }),
    ],
  });
}

// ── Müşteri talebi alındı ───────────────────────────────────────────────

export function requestReceivedEmail(d: OrderEmailData, type: "CANCEL" | "RETURN"): RenderedEmail {
  const isReturn = type === "RETURN";
  return customerEmail(d, {
    subject: `${isReturn ? "İade (cayma) bildiriminiz" : "İptal isteğiniz"} alındı — #${d.reference}`,
    preheader: "Talebiniz bize ulaştı.",
    title: isReturn ? "İade bildiriminiz alındı" : "İptal isteğiniz alındı",
    blocks: [
      hello(d),
      paragraph(
        isReturn
          ? "Cayma (iade) bildiriminiz bize ulaştı. Ürünü nasıl göndereceğinizi ve iade kodunu en kısa sürede ileteceğiz. Ödemeniz, bildiriminizin bize ulaştığı tarihten itibaren en geç 14 gün içinde iade edilir."
          : "İptal isteğiniz bize ulaştı. Siparişiniz kargoya verilmediyse iptal edip ödemenizin tamamını iade edeceğiz; sonucu size e-postayla bildireceğiz."
      ),
      button("Siparişi görüntüle", orderUrl(d)),
    ],
  });
}

// ── Admin'den özel mesaj ────────────────────────────────────────────────

export function customMessageEmail(d: OrderEmailData, subject: string, message: string): RenderedEmail {
  return customerEmail(d, {
    subject: `${subject} — #${d.reference}`,
    preheader: message.slice(0, 120),
    title: subject,
    blocks: [hello(d), paragraph(message), button("Siparişi görüntüle", orderUrl(d))],
  });
}
