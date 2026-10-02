/**
 * Admin — paketleme fişi (yazdırılır): gönderen, alıcı, ürünler ve adetleri, koli planı, müşteri notu, kapıda
 * tahsilat / alıcı ödemeli kargo uyarısı. Fiyat yazmaz (pakete konabilir).
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { loadAdminOrder } from "@/lib/admin/order-detail";
import { getBusinessInfo } from "@/lib/business/business.repository";
import { formatPhoneTr, sellerDisplayName } from "@/lib/business/info";
import { formatPrice } from "@/types";
import { siteUrl } from "@/lib/email/brand";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Paketleme fişi" };

const dateTr = (d: Date) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeZone: "Europe/Istanbul" }).format(d);

export default async function PackingSlip({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [d, business] = await Promise.all([loadAdminOrder(id), getBusinessInfo()]);
  if (!d) notFound();
  const { order } = d;
  const a = order.shippingAddress;
  const cod = order.paymentMethod === "CASH_ON_DELIVERY";
  const recipientPays = a?.shippingMode === "recipient";
  const units = order.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <div style={st.page}>
      <style>{`
        body { background: #fff !important; }
        @media print { .no-print { display: none !important; } @page { margin: 14mm; } }
      `}</style>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <a href={`/admin/siparisler/${order.id}`} style={{ color: "#333" }}>
          ‹ Siparişe dön
        </a>
        <PrintButton />
      </div>

      <header style={st.head}>
        <div>
          <h1 style={st.h1}>Paketleme fişi</h1>
          <p style={st.small}>
            Sipariş #{order.reference} · {dateTr(order.createdAt)}
          </p>
        </div>
        <strong style={{ fontSize: 15 }}>{sellerDisplayName(business) || "Çiftçi Ece"}</strong>
      </header>

      {(cod || recipientPays) && (
        <div style={st.warn}>
          {cod && <p style={{ margin: 0 }}>KAPIDA ÖDEME: alıcıdan {formatPrice(order.totalKurus)} tahsil edilecek (tahsilatlı gönderi).</p>}
          {recipientPays && <p style={{ margin: 0 }}>KARGO ÜCRETİ ALICI ÖDEMELİ.</p>}
        </div>
      )}

      <div style={st.cols}>
        <section style={st.box}>
          <h2 style={st.h2}>Alıcı</h2>
          <p style={st.big}>
            {a?.firstName} {a?.lastName}
          </p>
          <p style={st.p}>{a?.address}</p>
          <p style={st.p}>
            {a?.district} / {a?.city}
            {a?.postalCode ? ` ${a.postalCode}` : ""}
          </p>
          <p style={st.p}>Tel: {a?.phone ? formatPhoneTr(a.phone) : d.phone ? formatPhoneTr(d.phone) : "—"}</p>
        </section>
        <section style={st.box}>
          <h2 style={st.h2}>Gönderen</h2>
          <p style={st.big}>{sellerDisplayName(business) || "Çiftçi Ece"}</p>
          {business.address && <p style={st.p}>{business.address}</p>}
          {business.phone && <p style={st.p}>Tel: {formatPhoneTr(business.phone)}</p>}
        </section>
      </div>

      <table style={st.table}>
        <thead>
          <tr>
            <th style={{ ...st.th, width: 32 }}>✓</th>
            <th style={st.th}>Ürün</th>
            <th style={st.th}>Seçenek</th>
            <th style={{ ...st.th, textAlign: "right" }}>Adet</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.id}>
              <td style={st.td}>☐</td>
              <td style={st.td}>{i.snapshotName}</td>
              <td style={st.td}>{i.snapshotVariant}</td>
              <td style={{ ...st.td, textAlign: "right", fontWeight: 700 }}>{i.quantity}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={st.td} colSpan={3}>
              Toplam
            </td>
            <td style={{ ...st.td, textAlign: "right", fontWeight: 700 }}>{units}</td>
          </tr>
        </tfoot>
      </table>

      {a?.parcels && a.parcels.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <h2 style={st.h2}>Koli planı</h2>
          {a.parcels.map((p, idx) => (
            <p key={idx} style={st.p}>
              {idx + 1}. {p.box}: {p.items} ürün · {(p.grossGrams / 1000).toFixed(1)} kg · {p.desi} desi
            </p>
          ))}
        </section>
      )}

      {order.customerNote && (
        <section style={{ ...st.box, marginTop: 16 }}>
          <h2 style={st.h2}>Müşteri notu</h2>
          <p style={{ ...st.p, whiteSpace: "pre-wrap" }}>{order.customerNote}</p>
        </section>
      )}

      <p style={{ ...st.small, marginTop: 24 }}>
        Teşekkür ederiz. Siparişinizin durumu ve belgeleri: {siteUrl()}/siparis/{order.reference}
      </p>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 760,
    margin: "0 auto",
    padding: 24,
    color: "#111",
    background: "#fff",
    fontFamily: "Inter, Arial, sans-serif",
    fontSize: 13,
    // globals.css başlık/paragraf renkleri değişkenden gelir
    ["--color-text" as string]: "#111",
    ["--color-text-secondary" as string]: "#111",
  },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #111", paddingBottom: 10, marginBottom: 14 },
  h1: { margin: 0, fontSize: 20 },
  h2: { margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "#555" },
  small: { margin: "2px 0 0", fontSize: 11, color: "#555", wordBreak: "break-all" },
  warn: { border: "2px solid #111", padding: "8px 10px", marginBottom: 14, fontWeight: 700, fontSize: 14 },
  cols: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  box: { border: "1px solid #bbb", padding: "10px 12px", borderRadius: 4 },
  big: { margin: "0 0 4px", fontSize: 15, fontWeight: 700 },
  p: { margin: "0 0 3px", lineHeight: 1.45 },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 16 },
  th: { textAlign: "left", borderBottom: "1px solid #111", padding: "6px 4px", fontSize: 12 },
  td: { borderBottom: "1px solid #ddd", padding: "7px 4px" },
};
