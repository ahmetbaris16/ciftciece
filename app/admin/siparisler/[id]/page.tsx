/**
 * Admin — Sipariş Detay
 * Sıradaki adım (durum düğmeleri, takip numarasıyla kargolama), müşteri talepleri, ürünler ve tutarlar, iade
 * kaydı, ödeme denemeleri / olayları / uyarıları, müşteriye e-posta ve siparişin e-postaları, tam sipariş geçmişi
 * (iç notlarla), müşteri / teslimat / fatura bilgisi, fatura numarası, sözleşme onayları.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/AdminShell";
import OrderActions from "@/components/admin/OrderActions";
import ReconcileButton from "@/components/admin/ReconcileButton";
import ShipForm from "@/components/admin/order/ShipForm";
import RefundForm from "@/components/admin/order/RefundForm";
import InvoiceForm from "@/components/admin/order/InvoiceForm";
import NoteForm from "@/components/admin/order/NoteForm";
import CustomerEmailForm from "@/components/admin/order/CustomerEmailForm";
import RequestActions from "@/components/admin/order/RequestActions";
import EmailRequeueButton from "@/components/admin/order/EmailRequeueButton";
import { formatPrice, type Order } from "@/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment/methods";
import { PROVIDER_LABELS, cardPaymentMode, isTestProvider } from "@/lib/payment/provider";
import { ALERT_TITLES, type PaymentAlertKind } from "@/lib/payment/alerts";
import { LEGAL_DOCUMENTS, type LegalDocumentId } from "@/lib/legal/documents";
import { loadAdminOrder } from "@/lib/admin/order-detail";
import { EMAIL_STATUS_TR, emailKindLabel } from "@/lib/email/kinds";
import { formatPhoneTr } from "@/lib/business/info";
import s from "./detail.module.css";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Ödeme bekleniyor", color: "#facc15" },
  PAID: { label: "Ödendi", color: "#4ade80" },
  PROCESSING: { label: "Hazırlanıyor", color: "#60a5fa" },
  SHIPPED: { label: "Kargoda", color: "#a78bfa" },
  DELIVERED: { label: "Teslim edildi", color: "#34d399" },
  CANCELLED: { label: "İptal edildi", color: "#f87171" },
  REFUNDED: { label: "İade edildi", color: "#fb923c" },
};

const ATTEMPT_STATUS_TR: Record<string, { label: string; color: string }> = {
  INITIATED: { label: "Bekliyor", color: "#facc15" },
  SUCCEEDED: { label: "Başarılı", color: "#4ade80" },
  FAILED: { label: "Başarısız", color: "#f87171" },
  MISMATCH: { label: "Uyuşmazlık", color: "#fb923c" },
  DUPLICATE: { label: "Çift ödeme", color: "#fb923c" },
  EXPIRED: { label: "Süresi doldu", color: "rgba(232,228,217,0.5)" },
};

const SOURCE_TR: Record<string, string> = {
  WEBHOOK: "Bildirim (webhook)",
  CALLBACK: "Tarayıcı dönüşü",
  QUERY: "Sunucu sorgusu",
  MANUAL: "Elle sorgu",
  ADMIN: "Admin",
  SYSTEM: "Sistem",
};

const ACTOR_TR: Record<string, string> = { SYSTEM: "Sistem", ADMIN: "Yönetici", CUSTOMER: "Müşteri", PROVIDER: "Banka" };

const REFUND_METHOD_TR: Record<string, string> = {
  CARD_PROVIDER: "Karta iade",
  BANK_TRANSFER: "Havale/EFT",
  CASH: "Elden",
  OTHER: "Diğer",
};

/** Baz puan → "1", "10", "20", "8,5" (yalnız gösterim) */
const formatRate = (bps: number) => (bps % 100 === 0 ? String(bps / 100) : (bps / 100).toFixed(2).replace(".", ","));

const dateTimeTr = (d: Date) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d);
const dateTr = (d: Date) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeZone: "Europe/Istanbul" }).format(d);

function nextStep(order: Order, paidKurus: number): string {
  if (order.needsAttention) return "Önce ödeme uyarısını çözün: banka panelinden kontrol edip gerekirse “bankadan sorgula”yı kullanın.";
  const cod = order.paymentMethod === "CASH_ON_DELIVERY";
  switch (order.status) {
    case "PENDING":
      return order.paymentMethod === "BANK_TRANSFER"
        ? `Havale bekleniyor. Hesabınıza ${formatPrice(order.totalKurus)} geçtiğinde (açıklamada sipariş no ${order.reference}) “Havale ödemesi alındı”ya basın.${order.paymentDueAt ? ` Son ödeme ${dateTimeTr(order.paymentDueAt)}; sonra sipariş kendiliğinden iptal olur.` : ""}`
        : `Kart ödemesi bekleniyor.${order.paymentDueAt ? ` Stok ${dateTimeTr(order.paymentDueAt)} tarihine kadar ayrılı;` : ""} müşteri ödemezse sipariş kendiliğinden iptal olur.`;
    case "PAID":
      return "Ödeme alındı. Siparişi hazırlayın; kargoya verince takip numarasını girin.";
    case "PROCESSING":
      return cod
        ? `Kapıda ödemeli: gönderiyi Yurtiçi Kargo'da tahsilatlı açın (tahsil edilecek ${formatPrice(order.totalKurus)}), sonra takip numarasını girin.`
        : "Hazırlanıyor. Kargoya verince takip numarasını girin.";
    case "SHIPPED":
      return cod
        ? "Kargoda. Kargo teslim edip ödemeyi tahsil edince “Teslim edildi”ye basın."
        : "Kargoda. Teslim edilince “Teslim edildi”ye basın (müşteriye e-posta gider).";
    case "DELIVERED":
      return paidKurus > 0
        ? "Teslim edildi. Müşteri teslimden itibaren 14 gün içinde cayma hakkını kullanabilir; iade gelirse aşağıdan iade kaydı girin."
        : "Teslim edildi.";
    case "CANCELLED":
      return "Sipariş iptal edildi.";
    case "REFUNDED":
      return "Sipariş iade edildi ve kapandı.";
    default:
      return "";
  }
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminSiparisDetay({ params }: Props) {
  const user = await requireAdmin();
  const { id } = await params;
  const d = await loadAdminOrder(id);
  if (!d) notFound();
  const { order } = d;

  const addr = order.shippingAddress;
  const recipientPays = addr?.shippingMode === "recipient";
  const status = STATUS[order.status] ?? { label: order.status, color: "#999" };
  const shipped = order.status === "SHIPPED" || order.status === "DELIVERED";
  const remaining = Math.max(0, d.paidKurus - d.refundedKurus);
  const testPaid = d.attempts.find((a) => a.status === "SUCCEEDED" && isTestProvider(a.provider))?.provider ?? null;
  const canShip = !order.needsAttention && (order.status === "PAID" || order.status === "PROCESSING");
  const openRequests = d.requests.filter((r) => r.status === "OPEN");
  const failedEmails = d.emails.filter((e) => e.status === "FAILED").length;
  const billing = order.billingInfo;
  // Akbank bilgileri girilene kadar kart ödemesi demo bankadır (lib/payment/provider.ts)
  const provider = cardPaymentMode() === "demo" ? "demo" : process.env.PAYMENT_PROVIDER;

  return (
    <AdminShell user={user} activeSection="siparisler">
      <div className={s.page}>
        <Link href="/admin/siparisler" className={s.back}>
          ‹ Siparişler
        </Link>

        <header className={s.head}>
          <div>
            <h1 className={s.title}>
              Sipariş <span className={s.ref}>#{order.reference}</span>
            </h1>
            <p className={s.meta}>
              {dateTimeTr(order.createdAt)} · {PAYMENT_METHOD_LABELS[order.paymentMethod]} · {formatPrice(order.totalKurus)}
            </p>
          </div>
          <div className={s.headActions}>
            <span className={s.status} style={{ color: status.color, background: `${status.color}22` }}>
              {status.label}
            </span>
            <a href={`/siparis/${order.reference}`} target="_blank" rel="noopener noreferrer">
              Müşterinin gördüğü sayfa
            </a>
            <a href={`/admin/siparisler/${order.id}/fis`} target="_blank" rel="noopener noreferrer">
              Paketleme fişi
            </a>
          </div>
        </header>

        {order.needsAttention && (
          <div className={`${s.card} ${s.alert}`} role="alert">
            <h2 className={s.h2} style={{ color: "#fb923c" }}>
              Dikkat: ödeme tarafında karar gerekiyor
            </h2>
            <p className={s.muted} style={{ marginBottom: "0.5rem" }}>
              Bu sipariş otomatik iptal edilmez ve kargolanamaz. Para hareketi otomatik yapılmaz; bankanın sanal POS panelinden kontrol edin.
            </p>
            {d.openAlerts.length === 0 && <p className={s.text}>Açık uyarı kaydı yok.</p>}
            {d.openAlerts.map((a) => (
              <div key={a.id} style={{ padding: "0.5rem 0", borderTop: "1px solid rgba(251,146,60,0.2)" }}>
                <p className={s.text} style={{ fontWeight: 600 }}>
                  {ALERT_TITLES[a.kind as PaymentAlertKind] ?? a.kind}
                  <span className={s.muted} style={{ fontWeight: 400 }}>
                    {" "}
                    · {dateTimeTr(a.createdAt)}
                  </span>
                </p>
                <p className={s.muted}>{a.message}</p>
              </div>
            ))}
          </div>
        )}

        {testPaid && (
          <div className={`${s.card} ${s.alert}`} role="alert">
            <h2 className={s.h2} style={{ color: "#fb923c" }}>
              {testPaid === "demo" ? "Demo ödeme: gerçek para alınmadı" : "Test ödemesi: gerçek para alınmadı"}
            </h2>
            <p className={s.muted}>
              {testPaid === "demo"
                ? "Bu sipariş, sanal POS bağlanmadan önce banka ödeme sayfasının demo kopyasıyla “ödendi”. "
                : "Bu sipariş bankanın test ortamında ödendi. "}
              Gerçek sipariş gibi kargolamayın. Deneme bittiyse aşağıdaki iade formundan “Diğer” yöntemiyle, sebep “
              {testPaid === "demo" ? "demo ödeme" : "test ödemesi"}” yazıp “siparişi kapat” seçerek kapatın.
            </p>
          </div>
        )}

        {openRequests.map((r) => (
          <div key={r.id} className={`${s.card} ${s.request}`}>
            <h2 className={s.h2} style={{ color: "#9ec5f0" }}>
              {r.type === "CANCEL" ? "Müşteri iptal istiyor" : "Müşteri cayma (iade) bildirdi"}
            </h2>
            <p className={s.muted} style={{ marginBottom: "0.4rem" }}>
              {dateTimeTr(r.createdAt)}
            </p>
            <p className={s.text} style={{ whiteSpace: "pre-wrap" }}>
              {r.message}
            </p>
            <p className={s.muted} style={{ margin: "0.5rem 0 0.75rem" }}>
              {r.type === "CANCEL"
                ? "Kabul ederseniz parayı iade edip aşağıdan iade kaydını “siparişi kapat” ile girin, sonra talebi “Sonuçlandı” yapın."
                : "Ürün size geri ulaşınca (en geç 14 gün içinde) parayı iade edin, iade kaydını girin ve talebi “Sonuçlandı” yapın."}
            </p>
            <RequestActions requestId={r.id} />
          </div>
        ))}

        <div className={s.grid}>
          <div className={s.main}>
            <section className={`${s.card} ${s.strong}`}>
              <h2 className={s.h2}>Sıradaki adım</h2>
              <p className={s.next}>{nextStep(order, d.paidKurus)}</p>
              {recipientPays && (canShip || order.status === "SHIPPED") && (
                <p className={s.next} style={{ color: "#e8c07a", fontWeight: 600 }}>
                  Kargo ALICI ÖDEMELİ: gönderiyi Yurtiçi Kargo&apos;da “ücreti alıcı öder” seçeneğiyle açın.
                </p>
              )}
              <OrderActions
                orderId={order.id}
                status={order.status}
                method={order.paymentMethod}
                paidKurus={d.paidKurus}
                refundedKurus={d.refundedKurus}
              />
              {canShip && (
                <>
                  <hr className={s.divider} />
                  <ShipForm orderId={order.id} additional={false} />
                </>
              )}
              {order.notes && (
                <p className={s.muted} style={{ marginTop: "0.75rem" }}>
                  Eski not: <span style={{ color: "#e8c07a" }}>{order.notes}</span>
                </p>
              )}
            </section>

            {d.shipments.length > 0 && (
              <section className={s.card}>
                <h2 className={s.h2}>Kargo</h2>
                <ul className={s.list}>
                  {d.shipments.map((sh) => (
                    <li key={sh.id} className={s.item}>
                      <p className={s.text}>
                        {sh.carrier} · <span className={s.tracking}>{sh.trackingNumber}</span>
                      </p>
                      <p className={s.muted}>
                        {dateTimeTr(sh.shippedAt)}
                        {sh.link && (
                          <>
                            {" "}
                            ·{" "}
                            <a href={sh.link} target="_blank" rel="noopener noreferrer" style={{ color: "#c4d68e" }}>
                              Takip sayfası
                            </a>
                          </>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
                {order.status === "SHIPPED" && !order.needsAttention && (
                  <details className={s.details} style={{ marginTop: "0.75rem" }}>
                    <summary>Ek koli ekle (ikinci takip numarası)</summary>
                    <ShipForm orderId={order.id} additional />
                  </details>
                )}
              </section>
            )}

            <section className={s.card}>
              <h2 className={s.h2}>Ürünler</h2>
              {order.items.map((item) => (
                <div key={item.id} className={s.line}>
                  <span>
                    {item.snapshotName} ({item.snapshotVariant}) × {item.quantity}
                    <span className={s.muted} style={{ display: "block" }}>
                      birim {formatPrice(item.snapshotPrice)} ·{" "}
                      {item.vatRateBps !== null ? `KDV %${formatRate(item.vatRateBps)}` : "KDV oranı girilmemiş"}
                      {item.discountKurus > 0 && <> · indirim {formatPrice(item.discountKurus)}</>}
                    </span>
                  </span>
                  <span>{formatPrice(item.snapshotPrice * item.quantity - item.discountKurus)}</span>
                </div>
              ))}
              <div className={s.line}>
                <span className={s.muted}>Kargo ({addr?.carrier?.name ?? "Yurtiçi Kargo"})</span>
                <span className={s.muted}>
                  {recipientPays ? "Alıcı ödemeli" : order.shippingKurus > 0 ? formatPrice(order.shippingKurus) : "Ücretsiz"}
                </span>
              </div>
              {order.paymentFeeKurus > 0 && (
                <div className={s.line}>
                  <span className={s.muted}>Kapıda ödeme bedeli</span>
                  <span className={s.muted}>{formatPrice(order.paymentFeeKurus)}</span>
                </div>
              )}
              <div className={s.total}>
                <span>Toplam</span>
                <span>{formatPrice(order.totalKurus)}</span>
              </div>
              <div className={s.money}>
                <div className={s.moneyCell}>
                  Alınan ödeme<strong>{formatPrice(d.paidKurus)}</strong>
                </div>
                <div className={s.moneyCell}>
                  İade edilen<strong>{formatPrice(d.refundedKurus)}</strong>
                </div>
                <div className={s.moneyCell}>
                  İade edilebilir<strong>{formatPrice(remaining)}</strong>
                </div>
              </div>
            </section>

            {(d.paidKurus > 0 || d.refunds.length > 0) && (
              <section className={s.card}>
                <h2 className={s.h2}>İade</h2>
                {d.refunds.length > 0 && (
                  <ul className={s.list} style={{ marginBottom: "0.75rem" }}>
                    {d.refunds.map((r) => (
                      <li key={r.id} className={s.item}>
                        <p className={s.text}>
                          {formatPrice(r.amountKurus)} · {REFUND_METHOD_TR[r.method] ?? r.method}
                          {r.reference && <span className={s.muted}> · no {r.reference}</span>}
                        </p>
                        <p className={s.muted}>
                          {dateTimeTr(r.createdAt)} · {r.reason}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {remaining > 0 && !order.needsAttention ? (
                  <RefundForm
                    key={remaining}
                    orderId={order.id}
                    remainingKurus={remaining}
                    paymentMethod={order.paymentMethod}
                    shipped={shipped}
                  />
                ) : remaining > 0 ? (
                  <p className={s.muted}>Ödeme uyarısı çözülmeden iade kaydı girilmez.</p>
                ) : (
                  <p className={s.muted}>Alınan ödemenin tamamı iade kaydına geçti.</p>
                )}
              </section>
            )}

            <section className={s.card}>
              <h2 className={s.h2}>Ödeme</h2>
              <p className={s.text}>{PAYMENT_METHOD_LABELS[order.paymentMethod]}</p>
              {order.paymentMethod === "CASH_ON_DELIVERY" && (
                <p className={s.muted}>Kapıda tahsil edilecek: {formatPrice(order.totalKurus)}</p>
              )}
              <h3 className={s.h3}>Ödeme denemeleri</h3>
              {d.attempts.length === 0 ? (
                <p className={s.muted}>Deneme kaydı yok.</p>
              ) : (
                <ul className={s.list}>
                  {d.attempts.map((a, i) => {
                    const st = ATTEMPT_STATUS_TR[a.status] ?? { label: a.status, color: "#999" };
                    return (
                      <li key={a.id} className={s.item}>
                        <p className={s.text}>
                          {i + 1}. {PROVIDER_LABELS[a.provider] ?? a.provider} · <span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span>{" "}
                          · beklenen {formatPrice(a.amountKurus)}
                        </p>
                        <p className={s.muted}>
                          Açıldı {dateTimeTr(a.createdAt)}
                          {a.verifiedAt && <> · doğrulandı {dateTimeTr(a.verifiedAt)}</>}
                          {a.providerPaymentId && (
                            <>
                              {" "}
                              · {a.provider === "demo" ? "demo onay kodu" : "banka işlem no"}{" "}
                              {a.provider.startsWith("akbank") || a.provider === "demo" ? a.providerPaymentId.split(":").pop() : a.providerPaymentId}
                            </>
                          )}
                        </p>
                        {a.method === "CARD" && (a.paidAmountKurus !== null || a.chargedAmountKurus !== null) && (
                          <p className={s.muted}>
                            Bankanın bildirdiği: tutar {a.paidAmountKurus !== null ? formatPrice(a.paidAmountKurus) : "—"} · çekilen{" "}
                            {a.chargedAmountKurus !== null ? formatPrice(a.chargedAmountKurus) : "—"}
                            {a.paidCurrency && <> · {a.paidCurrency}</>}
                            {a.installment && a.installment > 1 && <> · {a.installment} taksit</>}
                            {a.fraudStatus !== null && <> · fraud {a.fraudStatus}</>}
                          </p>
                        )}
                        {a.failureReason && (
                          <p className={s.muted} style={{ color: "#f3a0a0" }}>
                            {a.failureReason}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {d.legacyPayment && (
                <p className={s.muted} style={{ marginTop: "0.5rem" }}>
                  Eski ödeme kaydı: {d.legacyPayment.provider} · {d.legacyPayment.status}
                </p>
              )}
              {order.paymentMethod === "CARD" && (
                <ReconcileButton
                  orderId={order.id}
                  label={
                    provider === "demo"
                      ? "Demo bankadan sorgula"
                      : provider === "akbank"
                        ? "Akbank'tan sorgula"
                        : provider === "iyzico"
                          ? "iyzico'dan sorgula"
                          : "Bankadan sorgula"
                  }
                />
              )}
              <details className={s.details} style={{ marginTop: "1rem" }}>
                <summary>Ödeme olayları ({d.paymentEvents.length})</summary>
                {d.paymentEvents.length === 0 ? (
                  <p className={s.muted}>Kayıt yok.</p>
                ) : (
                  d.paymentEvents.map((e) => (
                    <div key={e.id} className={s.line}>
                      <span className={s.muted}>
                        {dateTimeTr(e.processedAt)} · {e.source ? SOURCE_TR[e.source] ?? e.source : "—"} · {e.eventType}
                        {e.actorId && <> · admin {e.actorId.slice(0, 8)}</>}
                        {e.signatureValid === false && <span style={{ color: "#f3a0a0" }}> · imza geçersiz</span>}
                        {e.error && <span style={{ color: "#f3a0a0" }}> · {e.error}</span>}
                      </span>
                      <span className={s.muted}>{e.outcome ?? e.status}</span>
                    </div>
                  ))
                )}
              </details>
            </section>

            <section className={s.card}>
              <h2 className={s.h2}>Müşteriye e-posta</h2>
              <CustomerEmailForm orderId={order.id} to={order.guestEmail ?? null} />
              <h3 className={s.h3}>
                Bu siparişin e-postaları
                {failedEmails > 0 && <span style={{ color: "#f3a0a0" }}> · {failedEmails} gönderilemedi</span>}
              </h3>
              {d.emails.length === 0 ? (
                <p className={s.muted}>Henüz e-posta yok.</p>
              ) : (
                <ul className={s.list}>
                  {d.emails.map((m) => {
                    const st = EMAIL_STATUS_TR[m.status] ?? { label: m.status, color: "#999" };
                    return (
                      <li key={m.id} className={s.item}>
                        <div className={s.eventHead}>
                          <span style={{ color: st.color, fontWeight: 700 }}>{st.label}</span>
                          <span>{emailKindLabel(m.kind)}</span>
                          <span>· {m.audience === "store" ? "işletmeye" : m.toAddress}</span>
                          <span>· {dateTimeTr(m.sentAt ?? m.createdAt)}</span>
                        </div>
                        <p className={s.text} style={{ marginTop: "0.2rem" }}>
                          {m.subject}
                        </p>
                        {m.status !== "SENT" && m.lastError && (
                          <p className={s.muted} style={{ color: "#f3a0a0" }}>
                            {m.attempts} deneme · {m.lastError}
                          </p>
                        )}
                        {(m.status === "FAILED" || m.status === "CANCELLED") && <EmailRequeueButton emailId={m.id} />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className={s.card}>
              <h2 className={s.h2}>Sipariş geçmişi</h2>
              <NoteForm orderId={order.id} />
              <ul className={s.list} style={{ marginTop: "0.75rem" }}>
                {d.events.map((e) => (
                  <li key={e.id} className={s.item}>
                    <div className={s.eventHead}>
                      <span>{dateTimeTr(e.createdAt)}</span>
                      <span>· {ACTOR_TR[e.actorType] ?? e.actorType}</span>
                      <span className={e.visibleToCustomer ? `${s.tag} ${s.tagPublic}` : s.tag}>
                        {e.visibleToCustomer ? "müşteri görür" : e.type === "NOTE" ? "iç not" : "iç kayıt"}
                      </span>
                    </div>
                    <p className={s.text} style={{ marginTop: "0.2rem", whiteSpace: "pre-wrap" }}>
                      {e.message}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <aside className={s.side}>
            <section className={s.card}>
              <h2 className={s.h2}>Müşteri</h2>
              <p className={s.text}>{order.guestName}</p>
              {order.guestEmail && (
                <p className={s.muted}>
                  <a href={`mailto:${order.guestEmail}`}>{order.guestEmail}</a>
                </p>
              )}
              {d.phone && (
                <p className={s.muted}>
                  <a href={`tel:${d.phone}`}>{formatPhoneTr(d.phone)}</a>
                </p>
              )}
              {d.requests.length > openRequests.length && (
                <p className={s.muted} style={{ marginTop: "0.5rem" }}>
                  Kapanmış talepler:{" "}
                  {d.requests
                    .filter((r) => r.status !== "OPEN")
                    .map((r) => `${r.type === "CANCEL" ? "iptal" : "iade"} (${r.status === "RESOLVED" ? "sonuçlandı" : "reddedildi"})`)
                    .join(", ")}
                </p>
              )}
            </section>

            <section className={s.card}>
              <h2 className={s.h2}>Teslimat</h2>
              <p className={s.text}>
                {addr?.firstName} {addr?.lastName}
              </p>
              <p className={s.text}>{addr?.address}</p>
              <p className={s.muted}>
                {addr?.district} / {addr?.city}
                {addr?.postalCode ? ` ${addr.postalCode}` : ""}
              </p>
              {addr?.phone && <p className={s.muted}>{formatPhoneTr(addr.phone)}</p>}
              {addr?.parcels && addr.parcels.length > 0 && (
                <div style={{ marginTop: "0.75rem" }}>
                  <p className={s.muted}>Koli planı (sipariş anı):</p>
                  {addr.parcels.map((p, i) => (
                    <p key={i} className={s.muted}>
                      {i + 1}. {p.box}: {p.items} ürün · {(p.grossGrams / 1000).toFixed(1)} kg · {p.desi} desi
                    </p>
                  ))}
                </div>
              )}
            </section>

            {order.customerNote && (
              <section className={s.card}>
                <h2 className={s.h2}>Müşteri notu</h2>
                <p className={s.text} style={{ whiteSpace: "pre-wrap" }}>
                  {order.customerNote}
                </p>
              </section>
            )}

            <section className={s.card}>
              <h2 className={s.h2}>Fatura</h2>
              {!billing ? (
                <p className={s.muted}>Bireysel, teslimat bilgileriyle.</p>
              ) : (
                <dl className={s.kv}>
                  <dt>Tür</dt>
                  <dd>{billing.type === "CORPORATE" ? "Kurumsal" : "Bireysel"}</dd>
                  {billing.type === "CORPORATE" ? (
                    <>
                      <dt>Unvan</dt>
                      <dd>{billing.companyName}</dd>
                      <dt>Vergi dairesi</dt>
                      <dd>{billing.taxOffice}</dd>
                      <dt>Vergi no</dt>
                      <dd>{billing.taxNumber}</dd>
                    </>
                  ) : (
                    <>
                      <dt>Ad soyad</dt>
                      <dd>{billing.name}</dd>
                    </>
                  )}
                  <dt>Adres</dt>
                  <dd>
                    {billing.sameAsShipping ? "Teslimat adresiyle aynı" : `${billing.address ?? ""} ${billing.district ?? ""} / ${billing.city ?? ""}`}
                  </dd>
                </dl>
              )}
              <hr className={s.divider} />
              {order.invoiceNumber ? (
                <p className={s.text}>
                  Fatura no <strong>{order.invoiceNumber}</strong>
                  {order.invoiceIssuedAt && <span className={s.muted}> · {dateTr(order.invoiceIssuedAt)}</span>}
                </p>
              ) : (
                <p className={s.muted} style={{ marginBottom: "0.5rem" }}>
                  e-Arşiv faturayı düzenleyince numarasını girin; müşteri sipariş sayfasında görür.
                </p>
              )}
              <InvoiceForm orderId={order.id} current={order.invoiceNumber} />
            </section>

            <section className={s.card}>
              <h2 className={s.h2}>Sözleşme onayı</h2>
              {d.consents.length === 0 ? (
                <p className={s.muted}>Kayıt yok (bu sürümden önce verilmiş sipariş).</p>
              ) : (
                d.consents.map((c) => (
                  <p key={c.id} className={s.muted} style={{ marginBottom: "0.35rem" }}>
                    {LEGAL_DOCUMENTS[c.document as LegalDocumentId]?.title ?? c.document} · sürüm {c.version} · {dateTimeTr(c.acceptedAt)} · IP{" "}
                    {c.ipAddress ?? "bilinmiyor"}
                  </p>
                ))
              )}
            </section>
          </aside>
        </div>
      </div>
    </AdminShell>
  );
}
