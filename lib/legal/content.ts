/**
 * Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi — TEK KAYNAK (saf; sunucu ve istemci ortak).
 *
 * Aynı metin üç yerde kullanılır: yasal sayfalar (genel), ödeme adımı (sepete özel, onaydan hemen önce) ve
 * sipariş onay e-postası (siparişe özel; kalıcı veri saklayıcısı). Satıcı bilgileri admin → İşletme
 * bilgileri'nden gelir; girilmemiş kimlik bilgisi uydurulmaz (satır gösterilmez).
 *
 * Dayanak: 6502 sayılı Kanun, Mesafeli Sözleşmeler Yönetmeliği (RG 27.11.2014) md. 5 (ön bilgilendirme içeriği),
 * md. 6 (ödeme yükümlülüğünden hemen önce gösterim, en az 12 punto), md. 11–15 (cayma), md. 16 (en geç 30 gün);
 * 6563 sayılı Kanun ve e-ticaret yönetmeliği (sipariş teyidi, sözleşmenin saklanması, giriş hatalarının
 * düzeltilmesi). Hukuki danışmanlık değildir: metin yayından önce bir hukukçuya okutulmalıdır.
 *
 * KURAL: Metin değişirse lib/legal/documents.ts'teki sürüm de değişir (siparişte onaylanan sürüm kaydedilir).
 */

import { formatPhoneTr, sellerDisplayName, sellerLines, type BusinessInfo } from "@/lib/business/info";

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  list?: string[];
  /** Vurgulu kutu */
  note?: string;
  /** Etiket–değer satırları (satıcı/alıcı bilgisi) */
  rows?: Array<{ label: string; value: string }>;
}

/** Siparişe özel bilgiler (ödeme adımında sepetten, e-postada siparişten) */
export interface OrderContext {
  reference?: string;
  date?: Date;
  buyer: { name: string; email: string; phone: string };
  deliveryAddress: string;
  /** "Bireysel: Ad Soyad" ya da "Kurumsal: Unvan, VD, VKN" */
  billing?: string;
  items: Array<{ name: string; variant: string; quantity: number; unitPriceKurus: number; lineTotalKurus: number }>;
  subtotalKurus: number;
  /** null: kargo ücreti teslimatta alıcıdan alınır (alıcı ödemeli) */
  shippingKurus: number | null;
  paymentFeeKurus: number;
  discountKurus: number;
  totalKurus: number;
  paymentMethodLabel: string;
  carrierName: string;
}

/** Teslimat taahhüdü — teslimat sayfasıyla aynı (app/(legal)/teslimat) */
export const DELIVERY_TERMS = {
  dispatch: "Siparişler ödemenin onaylanmasından sonra genellikle 1–3 iş günü içinde kargoya verilir.",
  carrierTransit: "Kargo firmasının bölgenize göre teslim süresi genellikle 1–5 iş günüdür.",
  legalMax: "Sipariş, size ulaştığı tarihten itibaren her durumda en geç 30 gün içinde teslim edilir.",
  returnCarrier: "Yurtiçi Kargo",
};

const tl = (kurus: number) =>
  `${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(kurus / 100)} TL`;

const dateTr = (d: Date) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d);

function sellerSection(business: BusinessInfo, title = "Satıcı"): LegalSection {
  return { heading: title, rows: sellerLines(business) };
}

function contactLine(business: BusinessInfo): string {
  return [
    business.address,
    business.phone ? `Tel: ${formatPhoneTr(business.phone)}` : "",
    business.email ? `E-posta: ${business.email}` : "",
    business.kepAddress ? `KEP: ${business.kepAddress}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function orderRows(order: OrderContext): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (order.reference) rows.push({ label: "Sipariş no", value: order.reference });
  if (order.date) rows.push({ label: "Sipariş tarihi", value: dateTr(order.date) });
  for (const i of order.items) {
    rows.push({
      label: `${i.name} (${i.variant}) × ${i.quantity}`,
      value: `${tl(i.lineTotalKurus)} (birim ${tl(i.unitPriceKurus)})`,
    });
  }
  rows.push({ label: "Ürünler toplamı (KDV dahil)", value: tl(order.subtotalKurus) });
  if (order.discountKurus > 0) rows.push({ label: "İndirim", value: `−${tl(order.discountKurus)}` });
  rows.push({
    label: `Kargo (${order.carrierName})`,
    value:
      order.shippingKurus === null
        ? "Alıcı ödemeli — kargo ücreti teslimatta kargo firmasına ödenir"
        : order.shippingKurus === 0
          ? "Ücretsiz"
          : tl(order.shippingKurus),
  });
  if (order.paymentFeeKurus > 0) rows.push({ label: "Kapıda ödeme hizmet bedeli", value: tl(order.paymentFeeKurus) });
  rows.push({ label: "Tüm vergiler dahil toplam", value: tl(order.totalKurus) });
  rows.push({ label: "Ödeme yöntemi", value: order.paymentMethodLabel });
  return rows;
}

function buyerSection(order?: OrderContext): LegalSection {
  if (!order) {
    return {
      heading: "Alıcı",
      paragraphs: ["Siparişi veren kişi (“Alıcı”). Alıcının adı, iletişim ve teslimat bilgileri siparişte belirtilen bilgilerdir."],
    };
  }
  return {
    heading: "Alıcı",
    rows: [
      { label: "Ad soyad", value: order.buyer.name },
      { label: "E-posta", value: order.buyer.email },
      { label: "Telefon", value: order.buyer.phone },
      { label: "Teslimat adresi", value: order.deliveryAddress },
      ...(order.billing ? [{ label: "Fatura", value: order.billing }] : []),
    ],
  };
}

const PAYMENT_TEXTS = [
  "Kredi/banka kartı: ödeme bankanın 3D Secure güvenli ödeme sayfasında yapılır; kart bilgileri sitemize iletilmez ve saklanmaz.",
  "Havale/EFT: sipariş sonrası gösterilen hesaba, açıklamaya sipariş numarası yazılarak, belirtilen süre içinde ödenir; süresinde ödenmeyen sipariş iptal edilir ve stok ayırması kalkar.",
  "Kapıda ödeme (sunulduğu siparişlerde): ödeme teslimatta kargo görevlisine yapılır; varsa hizmet bedeli ödeme sayfasında toplama eklenerek gösterilir.",
  "Tüm fiyatlar Türk Lirası olup KDV dahildir.",
];

function withdrawalSections(business: BusinessInfo): LegalSection[] {
  return [
    {
      heading: "Cayma hakkı",
      paragraphs: [
        "Alıcı, ürünün kendisine ya da gösterdiği kişiye teslim edildiği günden itibaren 14 (on dört) gün içinde, hiçbir gerekçe göstermeden ve cezai şart ödemeden sözleşmeden cayabilir. Cayma hakkı sözleşmenin kurulmasından teslimata kadar olan sürede de kullanılabilir.",
        `Cayma bildirimi süre dolmadan yazılı olarak ya da kalıcı veri saklayıcısıyla (e-posta, sipariş sayfasındaki “İade / cayma bildirimi” formu) Satıcı'ya yöneltilir. Bildirim adresi: ${sellerDisplayName(business)} — ${contactLine(business)}.`,
        "Alıcı, cayma bildiriminden itibaren 10 gün içinde ürünü Satıcı'ya geri gönderir. Satıcı, bildirimin kendisine ulaşmasından itibaren en geç 14 gün içinde, teslimat masrafları dahil tahsil edilen tüm ödemeleri, ödemede kullanılan yöntemle ve Alıcı'ya ek masraf yüklemeden tek seferde iade eder.",
        `İade için kullanılacak taşıyıcı: ${DELIVERY_TERMS.returnCarrier}. Bu taşıyıcıyla ve Satıcı'nın vereceği iade koduyla gönderilen cayma iadelerinde kargo ücreti Satıcı'ya aittir.`,
        "Alıcı, ürünü olağan kullanımı dışında kullanması nedeniyle oluşan değer kaybından sorumludur.",
      ],
    },
    {
      heading: "Cayma hakkının kullanılamayacağı durumlar",
      list: [
        "Çabuk bozulabilen ya da son kullanma tarihi geçebilecek mallar.",
        "Tesliminden sonra ambalajı, bandı, mührü ya da paketi açılmış olup iadesi sağlık ve hijyen açısından uygun olmayan mallar (ambalajı açılmış zeytin, zeytinyağı, turşu ve diğer gıda ürünleri bu kapsamdadır).",
        "Alıcının istekleri ya da kişisel ihtiyaçları doğrultusunda hazırlanan mallar.",
      ],
      note: "Ambalajı açılmamış, hasarsız ürünlerde cayma hakkı geçerlidir.",
    },
  ];
}

const DISPUTE_TEXT =
  "Şikâyet ve itirazlar için, her yıl Ticaret Bakanlığınca belirlenen parasal sınırlar dahilinde Alıcı'nın ya da Satıcı'nın yerleşim yerindeki Tüketici Hakem Heyetine ya da Tüketici Mahkemesine başvurulabilir. Başvurular e-Devlet üzerinden Tüketici Bilgi Sistemi (TÜBİS) ile de yapılabilir.";

/** Ön Bilgilendirme Formu (Yönetmelik md. 5) */
export function preInformationSections(business: BusinessInfo, order?: OrderContext): LegalSection[] {
  return [
    sellerSection(business),
    buyerSection(order),
    order
      ? { heading: "Sözleşme konusu ürünler, fiyat ve ödeme", rows: orderRows(order) }
      : {
          heading: "Sözleşme konusu ürünler ve fiyat",
          paragraphs: [
            "Ürünlerin temel nitelikleri (ad, gramaj/hacim, adet), KDV dahil birim fiyatı ve toplam fiyat; kargo ücreti ve varsa ödeme yöntemi bedeli, ödeme adımında siparişi onaylamadan hemen önce ve sipariş onay e-postasında gösterilir.",
          ],
        },
    { heading: "Ödeme", list: PAYMENT_TEXTS },
    {
      heading: "Teslimat",
      list: [
        DELIVERY_TERMS.dispatch,
        DELIVERY_TERMS.carrierTransit,
        DELIVERY_TERMS.legalMax,
        "Gönderim yalnız yurt içine, Yurtiçi Kargo ile yapılır. Kargo ücreti ürünlerin ağırlığına ve paket boyutuna göre hesaplanır ve sipariş onayından önce gösterilir; ücret hesaplanamayan siparişlerde kargo alıcı ödemelidir (teslimatta kargo firmasına ödenir) ve bu durum siparişten önce belirtilir.",
        "Stok tükenmesi ya da teslimatın imkânsızlaşması hâlinde Alıcı bilgilendirilir ve ödenen tutar en geç 14 gün içinde iade edilir.",
      ],
    },
    ...withdrawalSections(business),
    {
      heading: "Sözleşmenin kurulması ve saklanması",
      list: [
        "Alıcı, ödeme adımında bilgilerini kontrol edip “Geri” ile düzeltebilir. Sipariş, son adımda “Siparişi onayla” düğmesine basılmasıyla verilir ve ÖDEME YÜKÜMLÜLÜĞÜ doğurur.",
        "Satıcı, siparişin alındığını gecikmeksizin e-postayla teyit eder. Bu form ve Mesafeli Satış Sözleşmesi siparişe özel olarak kaydedilir, sipariş onay e-postasıyla Alıcı'ya gönderilir ve sipariş sayfasından erişilebilir.",
        "Kişisel veriler KVKK Aydınlatma Metni ve Gizlilik Politikası'na göre işlenir.",
      ],
    },
    { heading: "Şikâyet ve uyuşmazlık", paragraphs: [`Şikâyetlerinizi ${contactLine(business)} üzerinden bize iletebilirsiniz.`, DISPUTE_TEXT] },
  ];
}

/** Mesafeli Satış Sözleşmesi */
export function distanceSalesSections(business: BusinessInfo, order?: OrderContext): LegalSection[] {
  const seller = sellerDisplayName(business);
  return [
    { ...sellerSection(business, "Madde 1 — Satıcı") },
    { ...buyerSection(order), heading: "Madde 2 — Alıcı" },
    {
      heading: "Madde 3 — Konu",
      paragraphs: [
        `İşbu sözleşmenin konusu, Alıcı'nın ${seller}'e ait internet sitesinden elektronik ortamda siparişini verdiği aşağıda nitelikleri ve satış fiyatı belirtilen ürünlerin satışı ve teslimine ilişkin olarak 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümleri gereğince tarafların hak ve yükümlülüklerinin belirlenmesidir.`,
      ],
    },
    order
      ? { heading: "Madde 4 — Ürünler, fiyat ve ödeme", rows: orderRows(order) }
      : {
          heading: "Madde 4 — Ürünler, fiyat ve ödeme",
          paragraphs: [
            "Ürünlerin temel nitelikleri, adedi, KDV dahil satış fiyatı, kargo ücreti, ödeme şekli ve teslimat bilgileri sipariş özetinde ve sipariş onay e-postasında yer alır ve bu sözleşmenin ayrılmaz parçasıdır.",
          ],
        },
    { heading: "Madde 5 — Ödeme", list: PAYMENT_TEXTS },
    {
      heading: "Madde 6 — Teslimat",
      list: [
        DELIVERY_TERMS.dispatch,
        DELIVERY_TERMS.legalMax,
        "Ürün, Alıcı'nın siparişte belirttiği adrese ya da gösterdiği kişiye teslim edilir. Teslimat anında paketi kontrol etmeniz; hasar varsa kargo görevlisine tutanak tutturmanız önerilir.",
        "Satıcı, ürünün sağlam, eksiksiz ve siparişteki niteliklere uygun teslim edilmesinden sorumludur.",
        "Ödemesi alınmamış (ya da banka kayıtlarında iptal edilmiş) siparişte Satıcı'nın teslim yükümlülüğü doğmaz.",
      ],
    },
    ...withdrawalSections(business).map((s, i) => ({ ...s, heading: `Madde ${7 + i} — ${s.heading}` })),
    {
      heading: "Madde 9 — Ayıplı mal",
      paragraphs: [
        "Ürünün ayıplı çıkması hâlinde Alıcı, 6502 sayılı Kanun'un 11. maddesindeki seçimlik haklarını (sözleşmeden dönme, bedel indirimi, ücretsiz onarım, ayıpsız misliyle değişim) kullanabilir. Hasarlı ya da yanlış ürün için iade kargo ücreti Satıcı'ya aittir.",
      ],
    },
    { heading: "Madde 10 — Uyuşmazlık", paragraphs: [DISPUTE_TEXT] },
    {
      heading: "Madde 11 — Yürürlük",
      paragraphs: [
        "Alıcı, Ön Bilgilendirme Formu'nu ve bu sözleşmeyi okuyup onayladığını, siparişi onaylamakla ödeme yükümlülüğü altına girdiğini kabul eder. Sözleşme, siparişin Alıcı tarafından elektronik ortamda onaylandığı anda kurulur; bir kopyası sipariş onay e-postasıyla Alıcı'ya gönderilir.",
      ],
    },
  ];
}

/** Yönetmelik ekindeki cayma formu (doldurulup e-postayla ya da sipariş sayfasındaki formla iletilebilir) */
export function withdrawalFormSections(business: BusinessInfo): LegalSection[] {
  return [
    { heading: "Kime", rows: [{ label: "Satıcı", value: sellerDisplayName(business) }, { label: "İletişim", value: contactLine(business) }] },
    {
      heading: "Cayma beyanı",
      paragraphs: [
        "Bu formla aşağıdaki ürünlerin satışına ilişkin sözleşmeden cayma hakkımı kullandığımı bildiririm.",
        "Sipariş tarihi / teslim tarihi: …",
        "Sipariş numarası: …",
        "Cayma hakkına konu ürünler: …",
        "Ürün bedeli: …",
        "Tüketicinin adı soyadı: …",
        "Tüketicinin adresi: …",
        "Tüketicinin imzası (kâğıt üzerinde gönderiliyorsa): …",
        "Tarih: …",
      ],
    },
  ];
}

/** E-postalarda düz metin bölümleri */
export function sectionsToParagraphs(sections: LegalSection[]): Array<{ heading?: string; paragraphs: string[] }> {
  return sections.map((s) => ({
    heading: s.heading,
    paragraphs: [
      ...(s.rows?.map((r) => `${r.label}: ${r.value}`) ?? []),
      ...(s.paragraphs ?? []),
      ...(s.list?.map((l) => `• ${l}`) ?? []),
      ...(s.note ? [s.note] : []),
    ],
  }));
}
