/**
 * Sipariş sayfası — /siparis/[ref]
 *
 * Müşterinin siparişle ilgili her şeyi gördüğü tek sayfa: durum ve adımlar, zaman çizelgesi (müşteriye görünen
 * geçmiş), havale bilgileri, ödemesi yarım kalan kartta "Ödemeyi tamamla", kargo takip numarası, ürünler ve
 * tutarlar, teslimat/fatura bilgisi, fatura numarası, iadeler, iptal/iade talebi, siparişe özel sözleşmeler ve teslim
 * edilince ürün değerlendirmesi (üye olmadan verilmiş siparişte de).
 * Sipariş numarası (tahmin edilemez referans) sayfanın anahtarıdır; arama motorlarına kapalıdır.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPrice } from "@/types";
import { loadCustomerOrderView, progressIndex } from "@/lib/orders/customer-view";
import { addressText, billingText, formatIban, itemDiscountKurus } from "@/lib/notifications/order-data";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment/methods";
import { RECIPIENT_PAYS_NOTE } from "@/lib/shipping/quote";
import { distanceSalesSections, preInformationSections } from "@/lib/legal/content";
import { formatPhoneTr } from "@/lib/business/info";
import { getCurrentCustomer } from "@/lib/auth/session";
import { getOrderReviewContext } from "@/lib/repositories/product-review.repository";
import LegalSections from "@/components/legal/LegalSections";
import ClearCartOnPaid from "./ClearCartOnPaid";
import CopyButton from "./CopyButton";
import PayNowButton from "./PayNowButton";
import OrderRequests from "./OrderRequests";
import OrderReviews from "./OrderReviews";
import styles from "./order.module.css";

export const metadata: Metadata = {
  title: "Siparişiniz",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAID = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];
const STEPS = ["Sipariş alındı", "Ödeme", "Hazırlanıyor", "Kargoda", "Teslim edildi"];

const dateTimeTr = (d: Date) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d);
const dateTr = (d: Date) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeZone: "Europe/Istanbul" }).format(d);

const REFUND_TR: Record<string, string> = {
  CARD_PROVIDER: "Karta iade",
  BANK_TRANSFER: "Banka hesabına iade",
  CASH: "Elden iade",
  OTHER: "İade",
};

interface Props {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ odeme?: string | string[] }>;
}

export default async function SiparisPage({ params, searchParams }: Props) {
  const { ref } = await params;
  const { odeme } = await searchParams;
  const view = await loadCustomerOrderView(ref);
  if (!view) notFound();

  const d = view.data;
  // Teslim edildiyse ürün değerlendirmesi (bölüm yüklenemezse sayfanın geri kalanı yine açılır)
  const reviewContext =
    d.status === "DELIVERED"
      ? await getOrderReviewContext(d.reference).catch((err) => {
          console.error("[siparis] Değerlendirme bölümü yüklenemedi:", err);
          return null;
        })
      : null;
  const viewer = reviewContext ? await getCurrentCustomer().catch(() => null) : null;
  const isPaid = PAID.includes(d.status);
  const isCod = d.paymentMethod === "CASH_ON_DELIVERY";
  const itemDiscount = itemDiscountKurus(d);
  const awaitingTransfer = d.paymentMethod === "BANK_TRANSFER" && d.status === "PENDING";
  const cardPending = d.paymentMethod === "CARD" && d.status === "PENDING";
  const reviewing = cardPending && view.needsAttention;
  const verifying = cardPending && !reviewing && odeme === "dogrulaniyor";
  const closed = d.status === "CANCELLED" || d.status === "REFUNDED";
  // Sipariş kesinleşti (ödendi / havale bekliyor / kapıda ödeme) → sepet temizlenir
  const placed = isPaid || awaitingTransfer;
  const step = progressIndex(d.status);
  const phone = formatPhoneTr(d.business.phone);
  const whatsapp = d.business.whatsapp
    ? `https://wa.me/${d.business.whatsapp}?text=${encodeURIComponent(`Merhaba, #${d.reference} numaralı siparişim hakkında yazıyorum.`)}`
    : null;
  const whatsappReceipt = d.business.whatsapp
    ? `https://wa.me/${d.business.whatsapp}?text=${encodeURIComponent(`Merhaba, #${d.reference} numaralı siparişimin havale/EFT ödemesini yaptım. Dekontu gönderiyorum.`)}`
    : null;

  let title: string;
  let message: string;
  if (reviewing) {
    title = "Ödemeniz kontrol ediliyor";
    message = `Ödemenizle ilgili bir kontrol yapıyoruz. Lütfen tekrar ödeme yapmayın; size ulaşacağız. Sorunuz için: ${phone}`;
  } else if (verifying) {
    title = "Ödemeniz doğrulanıyor";
    message = `Ödeme sonucunuzu bankadan teyit ediyoruz. Lütfen tekrar ödeme yapmayın; birkaç dakika sonra bu sayfayı yenileyin. Sorunuz için: ${phone}`;
  } else if (cardPending) {
    title = "Ödemeniz tamamlanmadı";
    message = "Siparişiniz oluşturuldu ve ürünleriniz kısa bir süre için ayrıldı, ancak kart ödemesi tamamlanmadı. Aşağıdan ödemeyi tamamlayabilirsiniz.";
  } else if (awaitingTransfer) {
    title = "Siparişiniz alındı — ödemenizi bekliyoruz";
    message = `Ürünlerinizi sizin için ayırdık. Aşağıdaki hesaba ${formatPrice(d.totalKurus)} gönderin ve açıklamaya sipariş numaranızı yazın. Ödemeniz hesabımıza geçince siparişiniz hazırlanır ve size e-posta gönderilir.`;
  } else if (d.status === "CANCELLED") {
    title = "Sipariş iptal edildi";
    message = d.refunds.length
      ? "Bu sipariş iptal edildi ve ödemeniz iade edildi (aşağıda)."
      : `Bu sipariş iptal edildi. Ödeme yaptıysanız ya da bir sorun olduğunu düşünüyorsanız bize ulaşın: ${phone}`;
  } else if (d.status === "REFUNDED") {
    title = "Sipariş iade edildi";
    message = "Bu siparişin ödemesi iade edildi (aşağıda).";
  } else if (d.status === "DELIVERED") {
    title = "Siparişiniz teslim edildi";
    message = "Afiyet olsun! Ürünleri aşağıdan değerlendirebilirsiniz. Bir sorun varsa “İade / iptal” bölümünden bize bildirin.";
  } else if (d.status === "SHIPPED") {
    title = "Siparişiniz kargoda";
    message = "Siparişiniz yola çıktı. Takip numaranızı aşağıda bulabilirsiniz.";
  } else if (isCod) {
    title = "Siparişiniz alındı";
    message = `Siparişiniz kesinleşti ve hazırlanıyor. Ödemeyi (${formatPrice(d.totalKurus)}) teslimatta kargo görevlisine yapacaksınız.`;
  } else {
    title = "Siparişiniz alındı";
    message = "Ödemeniz alındı, teşekkür ederiz. Siparişiniz hazırlanıp kargoya verildiğinde takip numarasını e-postayla göndereceğiz.";
  }

  return (
    <div className={styles.page}>
      {placed && <ClearCartOnPaid />}
      <div className={styles.container}>
        <header className={styles.hero}>
          <span className={`${styles.heroIcon} ${closed ? styles.heroIconMuted : reviewing || cardPending ? styles.heroIconWarn : ""}`} aria-hidden="true">
            {closed ? <XIcon /> : reviewing || verifying || cardPending ? <ClockIcon /> : <CheckIcon />}
          </span>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.refLine}>
            Sipariş no <strong className={styles.mono}>{d.reference}</strong>
            <CopyButton value={d.reference} label="Sipariş numarası" />
          </p>
          <p className={styles.date}>{dateTimeTr(d.createdAt)}</p>
          <p className={styles.message}>{message}</p>
          {view.testPayment && (
            <p className={styles.noteBox}>Bu sipariş deneme (demo/test) ödemesiyle onaylandı: karttan gerçek para çekilmedi.</p>
          )}
          {d.customerEmail && !closed && (
            <p className={styles.muted}>Her adımda {d.customerEmail} adresine e-posta gönderiyoruz.</p>
          )}
        </header>

        {step >= 0 && !reviewing && (
          <ol className={styles.progress} aria-label="Sipariş adımları">
            {STEPS.map((label, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <li key={label} className={`${done ? styles.pDone : ""} ${active ? styles.pActive : ""}`}>
                  <span className={styles.pDot}>{done ? <CheckSmall /> : i + 1}</span>
                  <span className={styles.pLabel}>{i === 1 && isCod ? "Kapıda ödeme" : label}</span>
                </li>
              );
            })}
          </ol>
        )}

        <div className={styles.layout}>
          <div className={styles.main}>
            {reviewContext && (
              <OrderReviews
                reference={d.reference}
                context={reviewContext}
                viewer={viewer ? { id: viewer.id, role: viewer.role } : null}
              />
            )}

            {awaitingTransfer && (
              <section className={`${styles.card} ${styles.highlight}`} aria-labelledby="bank-title">
                <h2 id="bank-title" className={styles.cardTitle}>
                  Havale / EFT bilgileri
                </h2>
                {d.bank ? (
                  <dl className={styles.kv}>
                    <div>
                      <dt>Banka</dt>
                      <dd>{d.bank.bankName}</dd>
                    </div>
                    <div>
                      <dt>Alıcı</dt>
                      <dd>{d.bank.accountHolder}</dd>
                    </div>
                    <div>
                      <dt>IBAN</dt>
                      <dd className={styles.kvCopy}>
                        <span className={styles.mono}>{formatIban(d.bank.iban)}</span>
                        <CopyButton value={d.bank.iban} label="IBAN" />
                      </dd>
                    </div>
                    <div>
                      <dt>Tutar</dt>
                      <dd className={styles.kvCopy}>
                        <strong>{formatPrice(d.totalKurus)}</strong>
                        <CopyButton value={(d.totalKurus / 100).toFixed(2).replace(".", ",")} label="Tutar" />
                      </dd>
                    </div>
                    <div>
                      <dt>Açıklama</dt>
                      <dd className={styles.kvCopy}>
                        <span className={styles.mono}>{d.reference}</span>
                        <CopyButton value={d.reference} label="Sipariş numarası" />
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className={styles.muted}>Hesap bilgilerimiz şu anda gösterilemiyor. Lütfen {phone} numarasından bize ulaşın.</p>
                )}
                {d.paymentDueAt && (
                  <p className={styles.noteBox}>
                    Son ödeme: <strong>{dateTimeTr(d.paymentDueAt)}</strong>. Bu zamana kadar ödeme gelmezse sipariş kendiliğinden
                    iptal olur.
                  </p>
                )}
                {whatsappReceipt && (
                  <p className={styles.muted}>
                    Ödemeyi yaptıktan sonra dekontu{" "}
                    <a href={whatsappReceipt} target="_blank" rel="noopener noreferrer">
                      WhatsApp&apos;tan gönderirseniz
                    </a>{" "}
                    siparişiniz daha hızlı hazırlanır.
                  </p>
                )}
              </section>
            )}

            {cardPending && !reviewing && !verifying && (
              <section className={`${styles.card} ${styles.highlight}`} aria-label="Ödemeyi tamamla">
                <PayNowButton orderId={d.id} amountText={formatPrice(d.totalKurus)} />
                {d.paymentDueAt && (
                  <p className={styles.muted}>Ürünleriniz {dateTimeTr(d.paymentDueAt)} tarihine kadar ayrılı; sonra sipariş kendiliğinden iptal olur.</p>
                )}
              </section>
            )}

            {d.shipments.length > 0 && (
              <section className={styles.card} aria-labelledby="ship-title">
                <h2 id="ship-title" className={styles.cardTitle}>
                  Kargo
                </h2>
                {d.shipments.map((s) => (
                  <div key={s.id} className={styles.shipment}>
                    <div>
                      <p className={styles.shipCarrier}>{s.carrier}</p>
                      <p className={styles.kvCopy}>
                        Takip no <strong className={styles.mono}>{s.trackingNumber}</strong>
                        <CopyButton value={s.trackingNumber} label="Takip numarası" />
                      </p>
                      <p className={styles.muted}>{dateTimeTr(s.shippedAt)} kargoya verildi</p>
                    </div>
                    {s.link && (
                      <a className={styles.secondaryBtn} href={s.link} target="_blank" rel="noopener noreferrer">
                        Kargoyu takip et
                      </a>
                    )}
                  </div>
                ))}
                <p className={styles.muted}>Takip sayfası numarayı kendiliğinden göstermezse takip numarasını sayfadaki kutuya yazın.</p>
              </section>
            )}

            {view.timeline.length > 0 && (
              <section className={styles.card} aria-labelledby="timeline-title">
                <h2 id="timeline-title" className={styles.cardTitle}>
                  Sipariş geçmişi
                </h2>
                <ol className={styles.timeline}>
                  {[...view.timeline].reverse().map((e, i) => (
                    <li key={`${e.at.toISOString()}-${i}`}>
                      <time dateTime={e.at.toISOString()}>{dateTimeTr(e.at)}</time>
                      <span>{e.message}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section className={styles.card} aria-labelledby="items-title">
              <h2 id="items-title" className={styles.cardTitle}>
                Ürünler
              </h2>
              <ul className={styles.items}>
                {d.items.map((i, idx) => (
                  <li key={idx}>
                    <span>
                      <span className={styles.itemName}>{i.name}</span>
                      <span className={styles.itemVariant}>
                        {i.variant} × {i.quantity}
                      </span>
                    </span>
                    <span className={styles.itemPrice}>
                      {i.lineTotalKurus < i.unitPriceKurus * i.quantity && (
                        <span className={styles.itemPriceOld}>
                          <span className="sr-only">İndirimden önce: </span>
                          {formatPrice(i.unitPriceKurus * i.quantity)}
                        </span>
                      )}
                      {formatPrice(i.lineTotalKurus)}
                    </span>
                  </li>
                ))}
              </ul>
              <dl className={styles.totals}>
                <div>
                  <dt>Ürünler</dt>
                  <dd>{formatPrice(d.subtotalKurus + itemDiscount)}</dd>
                </div>
                {itemDiscount > 0 && (
                  <div className={styles.saving}>
                    <dt>İndirim</dt>
                    <dd>−{formatPrice(itemDiscount)}</dd>
                  </div>
                )}
                <div>
                  <dt>Kargo ({d.carrierName})</dt>
                  <dd>{d.recipientPaysShipping ? "Teslimatta ödenir" : d.shippingKurus > 0 ? formatPrice(d.shippingKurus) : "Ücretsiz"}</dd>
                </div>
                {d.paymentFeeKurus > 0 && (
                  <div>
                    <dt>Kapıda ödeme bedeli</dt>
                    <dd>{formatPrice(d.paymentFeeKurus)}</dd>
                  </div>
                )}
                <div>
                  <dt>Ödeme yöntemi</dt>
                  <dd>{PAYMENT_METHOD_LABELS[d.paymentMethod]}</dd>
                </div>
                <div className={styles.grand}>
                  <dt>{isCod && !isPaid ? "Teslimatta ödenecek" : "Toplam (KDV dahil)"}</dt>
                  <dd>{formatPrice(d.totalKurus)}</dd>
                </div>
              </dl>
              {d.recipientPaysShipping && <p className={styles.muted}>{RECIPIENT_PAYS_NOTE}</p>}
            </section>

            <OrderRequests
              reference={d.reference}
              canCancelNow={view.options.canCancelNow && !view.needsAttention}
              canRequestCancel={view.options.canRequestCancel}
              canRequestReturn={view.options.canRequestReturn}
              openRequests={view.openRequests.map((r) => ({ type: r.type, createdAt: r.createdAt.toISOString() }))}
            />

            <section className={styles.card} aria-labelledby="docs-title">
              <h2 id="docs-title" className={styles.cardTitle}>
                Sözleşmeleriniz
              </h2>
              <p className={styles.muted}>Siparişinizde onayladığınız metinler (bir kopyası sipariş e-postanızda da var).</p>
              <details className={styles.doc}>
                <summary>Ön Bilgilendirme Formu</summary>
                <div className={styles.docBody}>
                  <LegalSections sections={preInformationSections(d.business, view.legal)} compact />
                </div>
              </details>
              <details className={styles.doc}>
                <summary>Mesafeli Satış Sözleşmesi</summary>
                <div className={styles.docBody}>
                  <LegalSections sections={distanceSalesSections(d.business, view.legal)} compact />
                </div>
              </details>
            </section>
          </div>

          <aside className={styles.side}>
            <section className={styles.card} aria-labelledby="delivery-title">
              <h2 id="delivery-title" className={styles.cardTitle}>
                Teslimat
              </h2>
              <p className={styles.sideText}>{addressText(d.address)}</p>
              <h3 className={styles.sideTitle}>Fatura</h3>
              <p className={styles.sideText}>{billingText(d.billing, d.customerName)}</p>
              {view.invoiceNumber && (
                <p className={styles.sideText}>
                  Fatura no <strong className={styles.mono}>{view.invoiceNumber}</strong>
                  {view.invoiceIssuedAt && <> · {dateTr(view.invoiceIssuedAt)}</>}
                </p>
              )}
              {d.customerNote && (
                <>
                  <h3 className={styles.sideTitle}>Notunuz</h3>
                  <p className={styles.sideText}>{d.customerNote}</p>
                </>
              )}
            </section>

            {d.refunds.length > 0 && (
              <section className={styles.card} aria-labelledby="refund-title">
                <h2 id="refund-title" className={styles.cardTitle}>
                  İadeler
                </h2>
                {d.refunds.map((r) => (
                  <p key={r.id} className={styles.sideText}>
                    <strong>{formatPrice(r.amountKurus)}</strong> — {REFUND_TR[r.method] ?? "İade"}, {dateTr(r.createdAt)}
                  </p>
                ))}
                <p className={styles.muted}>Kart iadelerinin ekstreye yansıması bankanıza göre birkaç iş günü sürebilir.</p>
              </section>
            )}

            <section className={styles.card} aria-labelledby="help-title">
              <h2 id="help-title" className={styles.cardTitle}>
                Yardım
              </h2>
              <p className={styles.sideText}>Siparişinizle ilgili her konuda bize ulaşabilirsiniz.</p>
              <div className={styles.helpLinks}>
                <a href={`tel:${d.business.phone}`}>{phone}</a>
                {whatsapp && (
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>
                )}
                <Link href={`/iletisim?konu=${encodeURIComponent("Siparişim hakkında")}&siparis=${encodeURIComponent(d.reference)}`}>
                  Mesaj gönder
                </Link>
              </div>
            </section>

            <Link href="/urunler" className={styles.continueLink}>
              Alışverişe devam et
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CheckSmall() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
