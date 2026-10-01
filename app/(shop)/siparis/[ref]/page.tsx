/**
 * Sipariş Onay Sayfası
 * /siparis/[ref]
 *
 * DB'den sipariş referansı ile gerçek sipariş verisi çeker.
 * - Kart: ödeme tamamlandıktan sonra /api/payment/verify buraya yönlendirir.
 * - Havale/EFT: sipariş verilince buraya gelinir; IBAN, tutar, açıklama (sipariş no) ve son ödeme zamanı gösterilir.
 * - Kapıda ödeme: sipariş kesinleşmiştir; teslimatta ödenecek tutar gösterilir.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderByReference } from "@/lib/repositories";
import { formatPrice } from "@/types";
import { getPaymentSettings } from "@/lib/payment/settings.repository";
import { PAYMENT_METHOD_LABELS, formatIban, hasBankDetails } from "@/lib/payment/methods";
import { RECIPIENT_PAYS_NOTE } from "@/lib/shipping/quote";
import { STORE } from "@/lib/config/store";
import ClearCartOnPaid from "./ClearCartOnPaid";
import CopyButton from "./CopyButton";
import styles from "./page.module.css";

const PAID_STATUSES = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

const dateTimeTr = (d: Date) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d);

const STATUS_COPY: Record<string, { title: string; message: string }> = {
  PENDING: {
    title: "Ödemeniz bekleniyor",
    message:
      "Siparişiniz oluşturuldu ancak ödeme henüz tamamlanmadı. Sepetiniz duruyor; ödeme sayfasından tekrar deneyebilirsiniz.",
  },
  CANCELLED: {
    title: "Sipariş iptal edildi",
    message:
      "Bu sipariş iptal edildi. Ödeme yaptıysanız ya da bir sorun olduğunu düşünüyorsanız bizi arayın: 0532 682 53 72",
  },
  REFUNDED: {
    title: "Sipariş iade edildi",
    message: "Bu siparişin ödemesi iade edildi.",
  },
};

interface Props {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ odeme?: string | string[] }>;
}

export const metadata: Metadata = {
  title: "Siparişiniz Alındı",
  robots: { index: false, follow: false },
};

export default async function SiparisOnayPage({ params, searchParams }: Props) {
  const { ref } = await params;
  const { odeme } = await searchParams;

  // DB'den siparişi çek
  const order = await getOrderByReference(ref);

  if (!order) {
    // Sipariş yoksa 404 — URL tahmin edilmiş olabilir
    notFound();
  }

  const addressInfo = order.shippingAddress;
  const isPaid = PAID_STATUSES.includes(order.status);
  const isCod = order.paymentMethod === "CASH_ON_DELIVERY";
  const awaitingTransfer = order.paymentMethod === "BANK_TRANSFER" && order.status === "PENDING";
  // Sipariş kesinleşti (ödendi / havale bekliyor / kapıda ödeme) → sepet temizlenir
  const placed = isPaid || awaitingTransfer;
  const bank = awaitingTransfer ? (await getPaymentSettings()).bankTransfer : null;
  const bankReady = bank ? hasBankDetails(bank) : false;
  const whatsappReceipt = `https://wa.me/${STORE.contact.whatsapp}?text=${encodeURIComponent(
    `Merhaba, #${order.reference} numaralı siparişimin havale/EFT ödemesini yaptım. Dekontu gönderiyorum.`
  )}`;
  const recipientPays = addressInfo?.shippingMode === "recipient";
  const copy = STATUS_COPY[order.status];
  // Kart dönüşünde sonuç sağlayıcıdan doğrulanamadıysa (ya da ödeme incelemedeyse) müşteri tekrar ödemesin
  const cardPending = order.status === "PENDING" && order.paymentMethod === "CARD";
  const reviewing = cardPending && order.needsAttention;
  const verifying = cardPending && !reviewing && odeme === "dogrulaniyor";

  const title = reviewing
    ? "Ödemeniz kontrol ediliyor"
    : verifying
      ? "Ödemeniz doğrulanıyor"
      : awaitingTransfer
    ? "Siparişiniz alındı — ödemeniz bekleniyor"
    : isPaid
      ? "Siparişiniz alındı"
      : copy?.title ?? "Sipariş durumu";
  const message = reviewing
    ? `Ödemenizle ilgili bir kontrol yapıyoruz. Lütfen tekrar ödeme yapmayın; size ulaşacağız. Sorunuz için: ${STORE.contact.phoneFormatted}`
    : verifying
      ? `Ödeme sonucunuzu ödeme kuruluşundan teyit ediyoruz. Lütfen tekrar ödeme yapmayın; birkaç dakika sonra bu sayfayı yenileyin. Sorunuz için: ${STORE.contact.phoneFormatted}`
      : awaitingTransfer
    ? `Siparişinizi ayırdık. Aşağıdaki hesaba ${formatPrice(order.totalKurus)} gönderin; açıklamaya sipariş numaranızı yazın. Ödemeniz hesabımıza geçince siparişiniz hazırlanır.`
    : isCod && isPaid
      ? `Siparişiniz kesinleşti ve hazırlanıyor. Ödemeyi (${formatPrice(order.totalKurus)}) teslimatta kargo görevlisine yapacaksınız. Kargoya verildiğinde telefonunuza bilgi gelecek.`
      : isPaid
        ? "Ödemeniz alındı. Siparişiniz hazırlanıp kargoya verildiğinde telefonunuza bilgi gelecek. Sipariş numaranızı saklayın."
        : copy?.message;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.card}>
          {placed && <ClearCartOnPaid />}
          {placed && (
            <div className={styles.iconWrap}>
              <CheckCircleIcon />
            </div>
          )}
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.ref}>
            Sipariş No: <strong>#{order.reference}</strong>
          </p>
          <p className={styles.message}>{message}</p>

          {awaitingTransfer && (
            <section className={styles.bankBox} aria-labelledby="bank-title">
              <h2 id="bank-title" className={styles.bankTitle}>
                Havale / EFT bilgileri
              </h2>
              {bank && bankReady ? (
                <dl className={styles.bankList}>
                  <div className={styles.bankRow}>
                    <dt>Banka</dt>
                    <dd>{bank.bankName}</dd>
                  </div>
                  <div className={styles.bankRow}>
                    <dt>Alıcı</dt>
                    <dd>{bank.accountHolder}</dd>
                  </div>
                  <div className={styles.bankRow}>
                    <dt>IBAN</dt>
                    <dd className={styles.bankValue}>
                      <span className={styles.mono}>{formatIban(bank.iban)}</span>
                      <CopyButton value={bank.iban} label="IBAN" />
                    </dd>
                  </div>
                  <div className={styles.bankRow}>
                    <dt>Tutar</dt>
                    <dd className={styles.bankValue}>
                      <strong>{formatPrice(order.totalKurus)}</strong>
                      <CopyButton value={(order.totalKurus / 100).toFixed(2).replace(".", ",")} label="Tutar" />
                    </dd>
                  </div>
                  <div className={styles.bankRow}>
                    <dt>Açıklama</dt>
                    <dd className={styles.bankValue}>
                      <span className={styles.mono}>{order.reference}</span>
                      <CopyButton value={order.reference} label="Sipariş numarası" />
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className={styles.bankNote}>
                  Hesap bilgilerimiz şu anda gösterilemiyor. Lütfen {STORE.contact.phoneFormatted} numarasından bize ulaşın.
                </p>
              )}
              {order.paymentDueAt && (
                <p className={styles.bankNote}>
                  Son ödeme: <strong>{dateTimeTr(order.paymentDueAt)}</strong>. Bu zamana kadar ödeme gelmezse sipariş
                  kendiliğinden iptal olur.
                </p>
              )}
              <p className={styles.bankNote}>
                Ödemeyi yaptıktan sonra dekontu{" "}
                <a href={whatsappReceipt} target="_blank" rel="noopener noreferrer">
                  WhatsApp&apos;tan gönderirseniz
                </a>{" "}
                siparişiniz daha hızlı hazırlanır.
              </p>
            </section>
          )}

          {cardPending && !reviewing && !verifying && (
            <p>
              <Link href="/odeme" className={styles.continueBtn}>Ödemeye dön</Link>
            </p>
          )}

          {/* Sipariş Özeti */}
          <div className={styles.orderSummary}>
            <h2 className={styles.orderSummaryTitle}>Sipariş Detayları</h2>
            <ul className={styles.itemList}>
              {order.items.map((item) => (
                <li key={item.id} className={styles.itemRow}>
                  <div className={styles.itemInfo}>
                    <span className={styles.itemName}>{item.snapshotName}</span>
                    <span className={styles.itemVariant}>
                      {item.snapshotVariant} × {item.quantity}
                    </span>
                  </div>
                  <span className={styles.itemPrice}>
                    {formatPrice(item.snapshotPrice * item.quantity - item.discountKurus)}
                  </span>
                </li>
              ))}
            </ul>
            <div className={styles.itemRow}>
              <span className={styles.itemVariant}>
                Kargo{addressInfo?.carrier ? ` (${addressInfo.carrier.name})` : ""}
              </span>
              <span className={styles.itemPrice}>
                {recipientPays ? "Teslimatta ödenir" : order.shippingKurus > 0 ? formatPrice(order.shippingKurus) : "Ücretsiz"}
              </span>
            </div>
            {order.paymentFeeKurus > 0 && (
              <div className={styles.itemRow}>
                <span className={styles.itemVariant}>Kapıda ödeme bedeli</span>
                <span className={styles.itemPrice}>{formatPrice(order.paymentFeeKurus)}</span>
              </div>
            )}
            <div className={styles.itemRow}>
              <span className={styles.itemVariant}>Ödeme yöntemi</span>
              <span className={styles.itemPrice}>{PAYMENT_METHOD_LABELS[order.paymentMethod]}</span>
            </div>
            <div className={styles.totalRow}>
              <span>{isCod ? "Teslimatta ödenecek" : "Toplam"}</span>
              <span>{formatPrice(order.totalKurus)}</span>
            </div>
            {recipientPays && <p className={styles.bankNote}>{RECIPIENT_PAYS_NOTE}</p>}
          </div>

          {/* Teslimat adresi */}
          {addressInfo && (
            <div className={styles.addressBox}>
              <MapPinIcon />
              <div>
                <p className={styles.addressTitle}>Teslimat Adresi</p>
                <p className={styles.addressText}>
                  {addressInfo.firstName} {addressInfo.lastName}
                </p>
                <p className={styles.addressText}>{addressInfo.address}</p>
                <p className={styles.addressText}>
                  {addressInfo.district}, {addressInfo.city}
                  {addressInfo.postalCode ? ` ${addressInfo.postalCode}` : ""}
                </p>
              </div>
            </div>
          )}

          <div className={styles.actions}>
            <Link href="/urunler" className={styles.continueBtn}>
              Alışverişe Devam Et
            </Link>
          </div>

          <div className={styles.storeNote}>
            <StoreIcon />
            <div>
              <p className={styles.storeNoteTitle}>Mağaza Bilgisi</p>
              <p className={styles.storeNoteText}>
                Muradiye, Zeytinciler Çarşısı, Orhangazi/Bursa
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckCircleIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, marginTop: 2 }}
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
