/**
 * Admin — Sipariş Detay
 * Durum düğmeleri (havale onayı dahil), ödeme yöntemi, kargonun kimin ödeyeceği ve koli planı.
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getOrderByReference } from "@/lib/repositories";
import AdminShell from "@/components/admin/AdminShell";
import OrderActions from "@/components/admin/OrderActions";
import { formatPrice, type Order } from "@/types";
import { prisma } from "@/lib/db/prisma";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment/methods";

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
  let paymentStatus: string | null = null;
  if (USE_DB) {
    const dbOrder = await prisma.order.findUnique({ where: { id }, select: { reference: true } });
    order = await getOrderByReference(dbOrder?.reference ?? id);
    if (order) {
      const p = await prisma.payment.findUnique({ where: { orderId: order.id }, select: { status: true, provider: true } });
      paymentStatus = p ? `${p.provider} · ${p.status}` : null;
    }
  }

  if (!order) notFound();

  const addr = order.shippingAddress;
  const recipientPays = addr?.shippingMode === "recipient";

  return (
    <AdminShell user={user} activeSection="siparisler">
      <div style={{ padding: "2rem", maxWidth: "800px" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#e8e4d9", margin: "0 0 1.5rem" }}>
          Sipariş #{order.reference}
        </h1>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Durum</h2>
          <p style={{ color: "#e8e4d9", fontSize: "1rem", fontWeight: 600, margin: "0 0 0.75rem" }}>
            {STATUS_TR[order.status] ?? order.status}
          </p>
          <OrderActions orderId={order.id} status={order.status} method={order.paymentMethod} />
          {order.notes && <p style={{ ...styles.textLight, marginTop: "0.75rem", color: "#e8c07a" }}>{order.notes}</p>}
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Ödeme</h2>
          <p style={styles.text}>{PAYMENT_METHOD_LABELS[order.paymentMethod]}</p>
          {order.paymentMethod === "BANK_TRANSFER" && order.status === "PENDING" && (
            <p style={styles.textLight}>
              Havale bekleniyor — açıklamada sipariş no: <strong style={{ color: "#e8e4d9" }}>{order.reference}</strong>
              {order.paymentDueAt && <> · son ödeme {dateTimeTr(order.paymentDueAt)} (sonra otomatik iptal)</>}
            </p>
          )}
          {order.paymentMethod === "CASH_ON_DELIVERY" && (
            <p style={styles.textLight}>
              Kapıda tahsil edilecek: <strong style={{ color: "#e8e4d9" }}>{formatPrice(order.totalKurus)}</strong> — gönderiyi
              Yurtiçi&apos;de tahsilatlı açın.
            </p>
          )}
          {paymentStatus && <p style={styles.textLight}>Ödeme kaydı: {paymentStatus}</p>}
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
              <span style={styles.text}>{item.snapshotName} — {item.snapshotVariant} × {item.quantity}</span>
              <span style={styles.text}>{formatPrice(item.snapshotPrice * item.quantity)}</span>
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
  sectionTitle: { fontSize: "0.875rem", fontWeight: 600, color: "rgba(232,228,217,0.5)", margin: "0 0 0.75rem", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  text: { color: "#e8e4d9", fontSize: "0.9375rem", margin: "0 0 0.25rem" },
  textLight: { color: "rgba(232,228,217,0.5)", fontSize: "0.8125rem", margin: 0 },
  line: { display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.5rem 0", borderBottom: "1px solid rgba(255,255,255,0.04)" },
};
