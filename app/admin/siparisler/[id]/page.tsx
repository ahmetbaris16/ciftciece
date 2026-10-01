/**
 * Admin — Sipariş Detay
 * Durum düğmeleri (havale onayı dahil), ödeme yöntemi, ödeme denemeleri, ödeme olayları, alarmlar
 * (NEEDS_ATTENTION), kargonun kimin ödeyeceği ve koli planı.
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getOrderByReference } from "@/lib/repositories";
import AdminShell from "@/components/admin/AdminShell";
import OrderActions from "@/components/admin/OrderActions";
import ReconcileButton from "@/components/admin/ReconcileButton";
import { formatPrice, type Order } from "@/types";
import { prisma } from "@/lib/db/prisma";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment/methods";
import { PROVIDER_LABELS, isTestProvider } from "@/lib/payment/provider";
import { ALERT_TITLES, type PaymentAlertKind } from "@/lib/payment/alerts";
import { LEGAL_DOCUMENTS, type LegalDocumentId } from "@/lib/legal/documents";

const USE_DB = !!process.env.DATABASE_URL;

const STATUS_TR: Record<string, string> = {
  PENDING: "Ödeme bekleniyor",
  PAID: "Ödendi",
  PROCESSING: "Hazırlanıyor",
  SHIPPED: "Kargoya verildi",
  DELIVERED: "Teslim edildi",
  CANCELLED: "İptal edildi",
  REFUNDED: "İade edildi",
};

const ATTEMPT_STATUS_TR: Record<string, { label: string; color: string }> = {
  INITIATED: { label: "Bekliyor", color: "#facc15" },
  SUCCEEDED: { label: "Başarılı", color: "#4ade80" },
  FAILED: { label: "Başarısız", color: "#f87171" },
  MISMATCH: { label: "Uyuşmazlık", color: "#fb923c" },
  DUPLICATE: { label: "Çift ödeme", color: "#fb923c" },
  EXPIRED: { label: "Süresi doldu", color: "rgba(232,228,217,0.5)" },
};

const PROVIDER_TR = PROVIDER_LABELS;

const SOURCE_TR: Record<string, string> = {
  WEBHOOK: "Bildirim (webhook)",
  CALLBACK: "Tarayıcı dönüşü",
  QUERY: "Sunucu sorgusu",
  MANUAL: "Elle sorgu",
  ADMIN: "Admin",
  SYSTEM: "Sistem",
};

/** Baz puan → "1", "10", "20", "8,5" (yalnız gösterim) */
const formatRate = (bps: number) => (bps % 100 === 0 ? String(bps / 100) : (bps / 100).toFixed(2).replace(".", ","));

const dateTimeTr = (d: Date) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d);

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminSiparisDetay({ params }: Props) {
  const user = await requireAdmin();
  const { id } = await params;

  // id olarak order ID veya reference alınabilir
  let order: Order | null = null;
  if (USE_DB) {
    const dbOrder = await prisma.order.findUnique({ where: { id }, select: { reference: true } });
    order = await getOrderByReference(dbOrder?.reference ?? id);
  }

  if (!order) notFound();

  const [attempts, events, alerts, legacyPayment, consents] = await Promise.all([
    prisma.paymentAttempt.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } }),
    prisma.paymentEvent.findMany({ where: { orderId: order.id }, orderBy: { processedAt: "desc" }, take: 40 }),
    prisma.paymentAlert.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "desc" } }),
    prisma.payment.findUnique({ where: { orderId: order.id }, select: { status: true, provider: true } }),
    prisma.orderConsent.findMany({ where: { orderId: order.id }, orderBy: { document: "asc" } }),
  ]);
  const openAlerts = alerts.filter((a) => !a.resolvedAt);

  const addr = order.shippingAddress;
  const recipientPays = addr?.shippingMode === "recipient";

  return (
    <AdminShell user={user} activeSection="siparisler">
      <div style={{ padding: "2rem", maxWidth: "860px" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#e8e4d9", margin: "0 0 1.5rem" }}>
          Sipariş #{order.reference}
        </h1>

        {order.needsAttention && (
          <div style={styles.attention} role="alert">
            <h2 style={{ ...styles.sectionTitle, color: "#fb923c" }}>Dikkat — ödeme tarafında karar gerekiyor</h2>
            <p style={{ ...styles.textLight, marginBottom: "0.5rem" }}>
              Bu sipariş otomatik iptal edilmez. Para hareketi (iade vb.) otomatik yapılmaz; ödeme kuruluşunun (banka) panelinden kontrol edin.
            </p>
            {openAlerts.length === 0 && <p style={styles.text}>Açık alarm kaydı yok.</p>}
            {openAlerts.map((a) => (
              <div key={a.id} style={{ padding: "0.5rem 0", borderTop: "1px solid rgba(251,146,60,0.2)" }}>
                <p style={{ ...styles.text, fontWeight: 600 }}>
                  {ALERT_TITLES[a.kind as PaymentAlertKind] ?? a.kind}
                  <span style={{ ...styles.textLight, fontWeight: 400 }}> · {dateTimeTr(a.createdAt)}</span>
                </p>
                <p style={styles.textLight}>{a.message}</p>
              </div>
            ))}
          </div>
        )}

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Durum</h2>
          <p style={{ color: "#e8e4d9", fontSize: "1rem", fontWeight: 600, margin: "0 0 0.75rem" }}>
            {STATUS_TR[order.status] ?? order.status}
          </p>
          <OrderActions orderId={order.id} status={order.status} method={order.paymentMethod} />
          {order.notes && (
            <p style={{ ...styles.textLight, marginTop: "0.75rem" }}>
              Eski not (sistem artık nota yazmıyor): <span style={{ color: "#e8c07a" }}>{order.notes}</span>
            </p>
          )}
        </div>

        {attempts.some((a) => a.status === "SUCCEEDED" && isTestProvider(a.provider)) && (
          <div style={styles.attention} role="alert">
            <h2 style={{ ...styles.sectionTitle, color: "#fb923c" }}>TEST ÖDEMESİ — gerçek para alınmadı</h2>
            <p style={styles.textLight}>
              Bu sipariş bankanın test ortamında ödendi. Kargolamayın; denemeyse iptal edin (iade kaydında “Diğer”, sebep: test).
            </p>
          </div>
        )}

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Ödeme</h2>
          <p style={styles.text}>{PAYMENT_METHOD_LABELS[order.paymentMethod]}</p>
          {order.paymentMethod === "BANK_TRANSFER" && order.status === "PENDING" && (
            <p style={styles.textLight}>
              Havale bekleniyor — açıklamada sipariş no: <strong style={{ color: "#e8e4d9" }}>{order.reference}</strong>
              {order.paymentDueAt && <> · son ödeme {dateTimeTr(order.paymentDueAt)} (sonra otomatik iptal)</>}
            </p>
          )}
          {order.paymentMethod === "CARD" && order.status === "PENDING" && order.paymentDueAt && (
            <p style={styles.textLight}>Kart ödemesi bekleniyor · stok {dateTimeTr(order.paymentDueAt)} tarihine kadar ayrılı</p>
          )}
          {order.paymentMethod === "CASH_ON_DELIVERY" && (
            <p style={styles.textLight}>
              Kapıda tahsil edilecek: <strong style={{ color: "#e8e4d9" }}>{formatPrice(order.totalKurus)}</strong> — gönderiyi
              Yurtiçi&apos;de tahsilatlı açın.
            </p>
          )}

          <h3 style={{ ...styles.sectionTitle, marginTop: "1rem" }}>Ödeme denemeleri</h3>
          {attempts.length === 0 ? (
            <p style={styles.textLight}>Deneme kaydı yok.</p>
          ) : (
            attempts.map((a, i) => {
              const s = ATTEMPT_STATUS_TR[a.status] ?? { label: a.status, color: "#999" };
              return (
                <div key={a.id} style={styles.attempt}>
                  <p style={styles.text}>
                    {i + 1}. {PROVIDER_TR[a.provider] ?? a.provider} ·{" "}
                    <span style={{ color: s.color, fontWeight: 600 }}>{s.label}</span> · beklenen {formatPrice(a.amountKurus)}
                  </p>
                  <p style={styles.textLight}>
                    Açıldı {dateTimeTr(a.createdAt)}
                    {a.verifiedAt && <> · doğrulandı {dateTimeTr(a.verifiedAt)}</>}
                    {a.providerPaymentId && <> · sağlayıcı ödeme no {a.providerPaymentId}</>}
                  </p>
                  {(a.paidAmountKurus !== null || a.chargedAmountKurus !== null) && (
                    <p style={styles.textLight}>
                      Sağlayıcının bildirdiği: sepet {a.paidAmountKurus !== null ? formatPrice(a.paidAmountKurus) : "—"} · çekilen{" "}
                      {a.chargedAmountKurus !== null ? formatPrice(a.chargedAmountKurus) : "—"}
                      {a.paidCurrency && <> · {a.paidCurrency}</>}
                      {a.installment && a.installment > 1 && <> · {a.installment} taksit</>}
                      {a.fraudStatus !== null && <> · fraud {a.fraudStatus}</>}
                    </p>
                  )}
                  {a.failureReason && <p style={{ ...styles.textLight, color: "#f3a0a0" }}>{a.failureReason}</p>}
                </div>
              );
            })
          )}
          {legacyPayment && (
            <p style={{ ...styles.textLight, marginTop: "0.5rem" }}>
              Eski ödeme kaydı: {legacyPayment.provider} · {legacyPayment.status}
            </p>
          )}
          {order.paymentMethod === "CARD" && (
            <ReconcileButton
              orderId={order.id}
              label={
                process.env.PAYMENT_PROVIDER === "akbank"
                  ? "Akbank'tan sorgula"
                  : process.env.PAYMENT_PROVIDER === "iyzico"
                    ? "iyzico'dan sorgula"
                    : "Ödeme sağlayıcısından sorgula"
              }
            />
          )}
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Ödeme olayları</h2>
          {events.length === 0 ? (
            <p style={styles.textLight}>Kayıt yok.</p>
          ) : (
            events.map((e) => (
              <div key={e.id} style={styles.line}>
                <span style={styles.textLight}>
                  {dateTimeTr(e.processedAt)} · {e.source ? SOURCE_TR[e.source] ?? e.source : "—"} · {e.eventType}
                  {e.actorId && <> · admin {e.actorId.slice(0, 8)}</>}
                  {e.signatureValid === false && <span style={{ color: "#f3a0a0" }}> · imza geçersiz</span>}
                  {e.error && <span style={{ color: "#f3a0a0" }}> · {e.error}</span>}
                </span>
                <span style={styles.textLight}>{e.outcome ?? e.status}</span>
              </div>
            ))
          )}
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Sözleşme onayı</h2>
          {consents.length === 0 ? (
            <p style={styles.textLight}>Kayıt yok (bu sürümden önce verilmiş sipariş).</p>
          ) : (
            consents.map((c) => (
              <p key={c.id} style={styles.textLight}>
                {LEGAL_DOCUMENTS[c.document as LegalDocumentId]?.title ?? c.document} · sürüm {c.version} ·{" "}
                {dateTimeTr(c.acceptedAt)} · IP {c.ipAddress ?? "bilinmiyor"}
              </p>
            ))
          )}
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Müşteri</h2>
          <p style={styles.text}>{order.guestName}</p>
          <p style={styles.textLight}>{order.guestEmail}</p>
          {addr?.phone && <p style={styles.textLight}>{addr.phone}</p>}
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Ürünler</h2>
          {order.items.map((item) => (
            <div key={item.id} style={styles.line}>
              <span style={styles.text}>
                {item.snapshotName} — {item.snapshotVariant} × {item.quantity}
                <span style={styles.textLight}>
                  {" "}· birim {formatPrice(item.snapshotPrice)} ·{" "}
                  {item.vatRateBps !== null ? `KDV %${formatRate(item.vatRateBps)}` : "KDV oranı girilmemiş"}
                  {item.discountKurus > 0 && <> · indirim {formatPrice(item.discountKurus)}</>}
                </span>
              </span>
              <span style={styles.text}>{formatPrice(item.snapshotPrice * item.quantity - item.discountKurus)}</span>
            </div>
          ))}
          <div style={styles.line}>
            <span style={styles.textLight}>Kargo ({addr?.carrier?.name ?? "—"})</span>
            <span style={styles.textLight}>
              {recipientPays ? "ALICI ÖDEMELİ" : order.shippingKurus > 0 ? formatPrice(order.shippingKurus) : "Ücretsiz"}
            </span>
          </div>
          {order.paymentFeeKurus > 0 && (
            <div style={styles.line}>
              <span style={styles.textLight}>Kapıda ödeme bedeli</span>
              <span style={styles.textLight}>{formatPrice(order.paymentFeeKurus)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem 0 0", fontWeight: 700, color: "#e8e4d9" }}>
            <span>Toplam</span>
            <span>{formatPrice(order.totalKurus)}</span>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Teslimat</h2>
          {recipientPays && (
            <p style={{ ...styles.text, color: "#e8c07a", fontWeight: 600 }}>
              Kargo ALICI ÖDEMELİ: gönderiyi Yurtiçi Kargo&apos;da “ücreti alıcı öder” seçeneğiyle açın.
            </p>
          )}
          <p style={styles.text}>{addr?.firstName} {addr?.lastName}</p>
          <p style={styles.text}>{addr?.address}</p>
          <p style={styles.textLight}>
            {addr?.district}, {addr?.city}
            {addr?.postalCode ? ` ${addr.postalCode}` : ""}
          </p>
          {addr?.parcels && addr.parcels.length > 0 && (
            <div style={{ marginTop: "0.75rem" }}>
              <p style={styles.textLight}>Koli planı (sipariş anı):</p>
              {addr.parcels.map((p, i) => (
                <p key={i} style={styles.textLight}>
                  {i + 1}. {p.box} — {p.items} ürün · {(p.grossGrams / 1000).toFixed(1)} kg · {p.desi} desi (faturalanan {p.billableDesi})
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { padding: "1.25rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", marginBottom: "1rem" },
  attention: { padding: "1.25rem", background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.45)", borderRadius: "12px", marginBottom: "1rem" },
  attempt: { padding: "0.5rem 0", borderBottom: "1px solid rgba(255,255,255,0.04)" },
  sectionTitle: { fontSize: "0.875rem", fontWeight: 600, color: "rgba(232,228,217,0.5)", margin: "0 0 0.75rem", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  text: { color: "#e8e4d9", fontSize: "0.9375rem", margin: "0 0 0.25rem" },
  textLight: { color: "rgba(232,228,217,0.5)", fontSize: "0.8125rem", margin: 0 },
  line: { display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.5rem 0", borderBottom: "1px solid rgba(255,255,255,0.04)" },
};
