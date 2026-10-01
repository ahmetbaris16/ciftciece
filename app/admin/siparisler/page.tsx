/**
 * Admin — Sipariş Listesi
 */

import { requireAdmin } from "@/lib/auth/session";
import { getOrdersForAdmin, releaseExpiredOrders } from "@/lib/repositories";
import AdminShell from "@/components/admin/AdminShell";
import Link from "next/link";
import { formatPrice } from "@/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment/methods";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Bekliyor", color: "#facc15" },
  PAID: { label: "Ödendi", color: "#4ade80" },
  PROCESSING: { label: "Hazırlanıyor", color: "#60a5fa" },
  SHIPPED: { label: "Kargoda", color: "#a78bfa" },
  DELIVERED: { label: "Teslim", color: "#34d399" },
  CANCELLED: { label: "İptal", color: "#f87171" },
  REFUNDED: { label: "İade", color: "#fb923c" },
};

export default async function AdminSiparislerPage() {
  const user = await requireAdmin();
  // Süresi dolan ödenmemiş siparişler listede güncel görünsün (stok iade edilir)
  await releaseExpiredOrders().catch((err) => console.error("[admin/siparisler]", err));
  const { orders, total } = await getOrdersForAdmin();

  return (
    <AdminShell user={user} activeSection="siparisler">
      <div style={{ padding: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#e8e4d9", margin: "0 0 0.25rem" }}>
          Siparişler
        </h1>
        <p style={{ fontSize: "0.875rem", color: "rgba(232,228,217,0.5)", margin: "0 0 1.5rem" }}>
          {total} sipariş
        </p>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Referans", "Müşteri", "Tutar", "Durum", "Tarih", ""].map((h) => (
                  <th key={h} style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "rgba(232,228,217,0.4)", textTransform: "uppercase" as const }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "3rem", textAlign: "center", color: "rgba(232,228,217,0.4)" }}>
                    Henüz sipariş yok
                  </td>
                </tr>
              ) : orders.map((order) => {
                const base = STATUS_LABELS[order.status] ?? { label: order.status, color: "#999" };
                // Havale bekleyen sipariş ayrıca işaretlenir: satıcı hesabı kontrol edip onaylar
                const status =
                  order.status === "PENDING" && order.paymentMethod === "BANK_TRANSFER"
                    ? { label: "Havale bekleniyor", color: base.color }
                    : base;
                return (
                  <tr key={order.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "0.75rem", fontWeight: 600, color: "#e8e4d9", fontSize: "0.875rem" }}>
                      #{order.reference}
                    </td>
                    <td style={{ padding: "0.75rem", fontSize: "0.875rem", color: "rgba(232,228,217,0.6)" }}>
                      {order.guestName ?? order.guestEmail ?? "—"}
                    </td>
                    <td style={{ padding: "0.75rem", fontSize: "0.875rem", color: "#e8e4d9" }}>
                      {formatPrice(order.totalKurus)}
                      <span style={{ display: "block", fontSize: "0.75rem", color: "rgba(232,228,217,0.45)" }}>
                        {PAYMENT_METHOD_LABELS[order.paymentMethod]}
                        {order.shippingAddress?.shippingMode === "recipient" ? " · kargo alıcı ödemeli" : ""}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      <span style={{
                        padding: "0.125rem 0.5rem", borderRadius: "4px",
                        fontSize: "0.75rem", fontWeight: 600,
                        background: `${status.color}20`, color: status.color,
                      }}>
                        {status.label}
                      </span>
                      {order.needsAttention && (
                        <span
                          title="Ödeme tarafında karar gerekiyor — detaya bakın"
                          style={{
                            marginLeft: "0.375rem", padding: "0.125rem 0.5rem", borderRadius: "4px",
                            fontSize: "0.75rem", fontWeight: 700, background: "#fb923c30", color: "#fb923c",
                          }}
                        >
                          Dikkat
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "0.75rem", fontSize: "0.8125rem", color: "rgba(232,228,217,0.4)" }}>
                      {new Date(order.createdAt).toLocaleDateString("tr-TR")}
                    </td>
                    <td style={{ padding: "0.75rem", textAlign: "right" }}>
                      <Link href={`/admin/siparisler/${order.id}`} style={{ color: "#8fa34e", fontSize: "0.8125rem", textDecoration: "none" }}>
                        Detay →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
