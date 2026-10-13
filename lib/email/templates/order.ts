/**
 * Müşteri sipariş e-postaları — kısa ve sade (kullanıcı isteği 2026-10-13; örnek: büyük pazaryerlerinin sipariş
 * e-postaları): ne oldu (sipariş numarasıyla), şimdi ne olacak, ürünler, gerekiyorsa tutar ve adres, sipariş
 * sayfası bağlantısı.
 *
 * "Siparişiniz alındı" e-postası yasal teyittir (e-ticaret mevzuatı: sipariş gecikmeksizin teyit edilir). Ön
 * Bilgilendirme Formu ile Mesafeli Satış Sözleşmesi'nin siparişe özel hâli e-postada yazmaz; pazaryerlerindeki gibi
 * sipariş sayfasındaki sözleşmelere bağlantı verilir (kullanıcı kararı 2026-10-14: e-posta kalabalık görünmesin).
 * Kalan risk: bağlantı, e-postanın içinde saklanan bir kopya kadar güçlü bir "kalıcı veri saklayıcısı" sayılmayabilir.
 */

import { formatPhoneTr } from "@/lib/business/info";
import { formatPrice } from "@/types";
import { emailFooter, emailImageUrl, siteUrl } from "../brand";
import {
  button,
  heading,
  keyValues,
  linkBox,
  notice,
  paragraph,
  productList,
  renderEmail,
  totalsTable,
  type Block,
  type Inline,
  type SummaryTotal,
} from "../layout";
import type { RenderedEmail } from "./account";
import { addressLines, billingText, formatIban, itemDiscountKurus, type OrderEmailData } from "@/lib/notifications/order-data";

const dateTimeTr = (d: Date) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d);

export const orderUrl = (d: OrderEmailData) => `${siteUrl()}/siparis/${d.reference}`;

/** Cümle içinde kalın sipariş numarası */
const orderNo = (d: OrderEmailData): Inline => ({ strong: d.reference });

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

/** Ürünler; withPrices: tutarlarıyla (sipariş teyidi), değilse yalnız ürün ve adet (kargo, teslim) */
function products(d: OrderEmailData, withPrices: boolean): Block {
  return productList(
    d.items.map((i) => {
      const full = i.unitPriceKurus * i.quantity;
      return {
        name: i.name,
        detail: `${i.variant} · ${i.quantity} adet`,
        amount: withPrices ? formatPrice(i.lineTotalKurus) : undefined,
        amountBefore: withPrices && i.lineTotalKurus < full ? formatPrice(full) : undefined,
        imageUrl: emailImageUrl(i.imageUrl),
      };
    })
  );
}

function deliveryBlock(d: OrderEmailData): Block {
  return keyValues(
    [
      { label: "Teslimat adresi", value: addressLines(d.address).join("\n") },
      { label: "Fatura bilgileri", value: billingText(d.billing, d.customerName) },
      { label: "Sipariş notunuz", value: d.customerNote ?? "" },
    ],
    { boxed: true, stacked: true }
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
        `Son ödeme: ${dateTimeTr(d.paymentDueAt)}. Açıklamaya sipariş numaranızı yazın; bu zamana kadar ödeme gelmezse sipariş kendiliğinden iptal olur.`,
        "warn"
      )
    );
  }
  return blocks;
}

/** Siparişe özel sözleşmelere bağlantı (sipariş sayfasının "Sözleşmeleriniz" bölümü) */
function contractsLink(d: OrderEmailData): Block {
  return linkBox([
    "Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi'ne ",
    { link: "buradan", href: `${orderUrl(d)}#sozlesmeler` },
    " ulaşabilirsiniz.",
  ]);
}

function customerEmail(
  d: OrderEmailData,
  opts: { subject: string; preheader: string; title: string; blocks: Block[]; reason?: string }
): RenderedEmail {
  const { html, text } = renderEmail({
    brandName: d.business.tradeName,
    preheader: opts.preheader,
    title: opts.title,
    blocks: opts.blocks,
    footer: emailFooter(
      d.business,
      opts.reason ?? "Bu e-postayı sitemizden verdiğiniz sipariş hakkında bilgilendirme amacıyla aldınız. Sorularınız için bu e-postayı yanıtlayabilirsiniz."
    ),
  });
  return { subject: opts.subject, html, text };
}

const hello = (d: OrderEmailData) => paragraph(`Merhaba ${d.firstName},`);

// ── Sipariş alındı (yasal teyit; sözleşmelere bağlantı) ───────────────────────

export function orderReceivedEmail(d: OrderEmailData): RenderedEmail {
  const blocks: Block[] = [hello(d)];
  let title = "Siparişiniz alındı";
  let preheader = `Sipariş #${d.reference} — ${formatPrice(d.totalKurus)}`;

  if (d.paymentMethod === "BANK_TRANSFER" && d.status === "PENDING") {
    title = "Siparişiniz alındı — ödemenizi bekliyoruz";
    preheader = `Havale/EFT bilgileri: ${formatPrice(d.totalKurus)}, açıklama ${d.reference}`;
    blocks.push(
      paragraph([
        orderNo(d),
        " numaralı siparişinizi aldık ve ürünlerinizi sizin için ayırdık. Aşağıdaki hesaba havale/EFT yaptığınızda siparişiniz hazırlanmaya başlar.",
      ]),
      ...bankBlocks(d)
    );
  } else if (d.paymentMethod === "CASH_ON_DELIVERY") {
    blocks.push(
      paragraph([
        orderNo(d),
        ` numaralı siparişiniz kesinleşti ve hazırlanıyor. Ödemeyi (${formatPrice(d.totalKurus)}) teslimatta kargo görevlisine yapacaksınız.`,
      ])
    );
  } else {
    // Kart: e-posta ödeme onaylanınca gider; başlık müşterinin beklediği ilk adım ("Siparişiniz alındı")
    preheader = `Ödemeniz onaylandı — ${formatPrice(d.totalKurus)}. Siparişiniz hazırlanıyor.`;
    blocks.push(
      paragraph([
        orderNo(d),
        " numaralı siparişinizi aldık. Ödemeniz onaylandı; siparişinizi hazırlamaya başlıyoruz. Kargoya verdiğimizde takip numarasını e-postayla göndereceğiz.",
      ])
    );
  }

  blocks.push(
    button("Siparişi görüntüle", orderUrl(d)),
    heading("Ürünler"),
    products(d, true),
    totalsTable(totals(d)),
    heading("Teslimat ve fatura"),
    deliveryBlock(d),
    paragraph("Adreste bir hata varsa siparişiniz kargoya verilene kadar sipariş sayfanızdan düzeltebilirsiniz.", {
      muted: true,
      small: true,
    }),
    contractsLink(d)
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
      paragraph([
        orderNo(d),
        ` numaralı siparişinizin ${formatPrice(d.totalKurus)} tutarındaki havale/EFT ödemesi hesabımıza geçti, teşekkür ederiz. Siparişinizi hazırlamaya başlıyoruz; kargoya verdiğimizde takip numarasını göndereceğiz.`,
      ]),
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
        ? [orderNo(d), " numaralı siparişinizin bir paketi daha kargoya verildi."]
        : [orderNo(d), " numaralı siparişiniz kargoya verildi."]
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
  }
  if (d.paymentMethod === "CASH_ON_DELIVERY") {
    blocks.push(notice(`Teslimatta ödenecek tutar: ${formatPrice(d.totalKurus)}`, "warn"));
  }
  blocks.push(
    heading("Siparişinizdeki ürünler"),
    products(d, false),
    paragraph(
      [
        "Paketi teslim alırken kontrol edin; hasar varsa kargo görevlisine tutanak tutturup bize bildirin. ",
        { link: "Siparişi görüntüle", href: orderUrl(d) },
      ],
      { muted: true, small: true }
    )
  );
  return customerEmail(d, {
    subject: `Siparişiniz kargoya verildi — #${d.reference}`,
    preheader: s ? `${s.carrier} takip no: ${s.trackingNumber}` : "Siparişiniz yolda.",
    title: additional ? "Bir paketiniz daha yolda" : "Siparişiniz kargoya verildi",
    blocks,
  });
}

// ── Teslim edildi ───────────────────────────────────────────────────────

/**
 * reviewCode: üye olmadan verilmiş siparişin tek kullanımlık değerlendirme kodu (paket fişindekiyle aynı; F-33).
 * Bağlantıya konmaz (e-posta tarayıcıları/önizlemeleri adresleri açabilir; kod yalnız müşterinin elinde kalsın).
 */
export function orderDeliveredEmail(d: OrderEmailData, reviewCode: string | null = null): RenderedEmail {
  return customerEmail(d, {
    subject: `Siparişiniz teslim edildi — #${d.reference}`,
    preheader: "Afiyet olsun! Ürünlerimizi nasıl buldunuz?",
    title: "Siparişiniz teslim edildi",
    blocks: [
      hello(d),
      paragraph([orderNo(d), " numaralı siparişiniz teslim edildi. Afiyet olsun!"]),
      heading("Ürünlerimizi nasıl buldunuz?"),
      paragraph("Değerlendirmeniz ürün sayfasında yayınlanır ve ürünü merak eden diğer müşterilerimize yol gösterir."),
      products(d, false),
      ...(reviewCode
        ? [
            keyValues([{ label: "Değerlendirme kodunuz", value: reviewCode, mono: true, strong: true }], { boxed: true }),
            paragraph(
              "Sipariş sayfanızdaki “Ürünleri değerlendirin” bölümüne bu kodu yazın. Kod tek kullanımlıktır ve paketinizdeki fişte de yazar; kimseyle paylaşmayın.",
              { small: true, muted: true }
            ),
          ]
        : [
            paragraph("Değerlendirmeyi siparişi verdiğiniz üyelik hesabınızla giriş yaparak yazabilirsiniz.", { small: true, muted: true }),
          ]),
      button("Ürünleri değerlendir", `${orderUrl(d)}#degerlendir`),
      paragraph("Eksik, hasarlı ya da yanlış ürün varsa bu e-postayı yanıtlayarak ya da sipariş sayfanızdan bize bildirin.", {
        muted: true,
        small: true,
      }),
    ],
  });
}

// ── İptal ───────────────────────────────────────────────────────────────

export function orderCancelledEmail(
  d: OrderEmailData,
  opts: { expired: boolean; byCustomer: boolean; reason: string | null }
): RenderedEmail {
  const detail = opts.expired
    ? d.paymentMethod === "BANK_TRANSFER"
      ? "Havale/EFT ödemeniz son ödeme zamanına kadar bize ulaşmadığı için ayrılan ürünler serbest bırakıldı. Ödeme yaptıysanız lütfen bize hemen ulaşın; sorunu birlikte çözelim."
      : "Kart ödemesi tamamlanmadığı için ayrılan ürünler serbest bırakıldı. Kartınızdan çekim yapıldığını görüyorsanız lütfen bize hemen ulaşın."
    : opts.byCustomer
      ? ""
      : opts.reason
        ? `İptal sebebi: ${opts.reason}`
        : "";
  return customerEmail(d, {
    subject: `Siparişiniz iptal edildi — #${d.reference}`,
    preheader: opts.expired ? "Ödeme süresi doldu." : "Siparişiniz iptal edildi.",
    title: "Siparişiniz iptal edildi",
    blocks: [
      hello(d),
      paragraph([orderNo(d), opts.byCustomer ? " numaralı siparişiniz isteğiniz üzerine iptal edildi." : " numaralı siparişiniz iptal edildi."]),
      ...(detail ? [paragraph(detail)] : []),
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
    paragraph([
      orderNo(d),
      ` numaralı siparişiniz için ${amount} tutarındaki iadeniz ${where ? `${where} ` : ""}yapıldı.${closed ? (d.status === "CANCELLED" ? " Siparişiniz iptal edildi." : " Siparişiniz iade edildi olarak kapatıldı.") : ""}`,
    ]),
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
      paragraph([
        orderNo(d),
        " numaralı siparişiniz için ayırdığımız ürünler sizi bekliyor, ancak ödemeniz henüz hesabımıza ulaşmadı. Ödemeyi yaptıysanız bu e-postayı dikkate almayın; geçmesi biraz sürebilir.",
      ]),
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
          ? [
              orderNo(d),
              " numaralı siparişiniz için cayma (iade) bildiriminiz bize ulaştı. Ürünü nasıl göndereceğinizi ve iade kodunu en kısa sürede ileteceğiz. Ödemeniz, bildiriminizin bize ulaştığı tarihten itibaren en geç 14 gün içinde iade edilir.",
            ]
          : [
              orderNo(d),
              " numaralı siparişiniz için iptal isteğiniz bize ulaştı. Siparişiniz kargoya verilmediyse iptal edip ödemenizin tamamını iade edeceğiz; sonucu size e-postayla bildireceğiz.",
            ]
      ),
      button("Siparişi görüntüle", orderUrl(d)),
    ],
  });
}

// ── Teslimat bilgisi değişti ────────────────────────────────────────────

/**
 * Teslimat bilgisi değişince müşteriye bilgi (kim değiştirmiş olursa olsun): değişikliği başkası yaptıysa
 * müşteri fark edip hemen ulaşabilsin.
 */
export function deliveryChangedEmail(d: OrderEmailData, by: "CUSTOMER" | "ADMIN"): RenderedEmail {
  return customerEmail(d, {
    subject: `Teslimat bilgileriniz güncellendi — #${d.reference}`,
    preheader: "Siparişiniz yeni adrese gönderilecek.",
    title: "Teslimat bilgileriniz güncellendi",
    blocks: [
      hello(d),
      paragraph(
        by === "CUSTOMER"
          ? [orderNo(d), " numaralı siparişinizin teslimat bilgilerini sipariş sayfanızdan güncellediniz. Siparişiniz aşağıdaki adrese gönderilecek."]
          : [orderNo(d), " numaralı siparişinizin teslimat bilgilerini güncelledik. Siparişiniz aşağıdaki adrese gönderilecek."]
      ),
      keyValues([{ label: "Teslimat adresi", value: addressLines(d.address).join("\n") }], { boxed: true, stacked: true }),
      notice(
        `Bu değişikliği siz yapmadıysanız hemen bize ulaşın: ${formatPhoneTr(d.business.phone)}. Siparişiniz kargoya verilene kadar teslimat bilgilerini sipariş sayfanızdan yeniden değiştirebilirsiniz.`,
        "warn"
      ),
      button("Siparişi görüntüle", orderUrl(d)),
    ],
  });
}

/**
 * Başka cihazdan adres değiştirmek isteyen müşteriye 24 saatlik bağlantı (lib/orders/access.ts). Bağlantı yalnız
 * sipariş e-postasına gider: sipariş numarasını bilen başkası adresi değiştiremez.
 */
export function deliveryLinkEmail(d: OrderEmailData, link: string, hours: number): RenderedEmail {
  return customerEmail(d, {
    subject: `Teslimat adresini değiştirme bağlantınız — #${d.reference}`,
    preheader: `Bağlantı ${hours} saat geçerlidir.`,
    title: "Teslimat bilgilerinizi değiştirin",
    blocks: [
      hello(d),
      paragraph([
        orderNo(d),
        ` numaralı siparişinizin teslimat bilgilerini (alıcı, telefon, adres) değiştirmek için aşağıdaki düğmeye basın. Bağlantı ${hours} saat geçerlidir ve yalnız bu sipariş içindir; siparişiniz kargoya verilene kadar kullanılabilir.`,
      ]),
      button("Teslimat bilgilerini değiştir", link),
      paragraph("Bu isteği siz yapmadıysanız e-postayı dikkate almayın; teslimat bilgileriniz değişmez.", { muted: true, small: true }),
    ],
    reason: "Bu e-postayı sipariş sayfanızdan istenen teslimat bilgisi değişikliği için aldınız.",
  });
}

// ── Admin'den özel mesaj ────────────────────────────────────────────────

export function customMessageEmail(d: OrderEmailData, subject: string, message: string): RenderedEmail {
  return customerEmail(d, {
    subject: `${subject} — #${d.reference}`,
    preheader: message.slice(0, 120),
    title: subject,
    blocks: [
      hello(d),
      paragraph(message),
      button("Siparişi görüntüle", orderUrl(d)),
    ],
  });
}
