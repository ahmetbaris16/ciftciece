/**
 * Admin — Siparişler: iş odaklı filtreler (kargolanacak, havale bekleyen, dikkat, müşteri talebi…), arama ve
 * sayfalama. Tarihler İstanbul saatiyle.
 */

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { releaseExpiredOrders } from "@/lib/repositories";
import AdminShell from "@/components/admin/AdminShell";
import { formatPrice } from "@/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment/methods";
import { ORDER_FILTERS, parseFilter, searchOrdersForAdmin, type OrderFilter } from "@/lib/admin/orders";
import { getAdminBadges } from "@/lib/admin/dashboard";
import rows_ from "@/components/admin/AdminRows.module.css";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Ödeme bekliyor", color: "#facc15" },
  PAID: { label: "Ödendi", color: "#4ade80" },
  PROCESSING: { label: "Hazırlanıyor", color: "#60a5fa" },
  SHIPPED: { label: "Kargoda", color: "#a78bfa" },
  DELIVERED: { label: "Teslim", color: "#34d399" },
  CANCELLED: { label: "İptal", color: "#f87171" },
  REFUNDED: { label: "İade", color: "#fb923c" },
};

const dateTimeTr = (d: Date) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d);

interface Props {
  searchParams: Promise<{ q?: string; durum?: string; sayfa?: string }>;
}

export default async function AdminSiparislerPage({ searchParams }: Props) {
  const user = await requireAdmin();
  const params = await searchParams;
  const filter = parseFilter(params.durum);
  const q = params.q ?? "";
  const page = Number(params.sayfa) || 1;
  // Süresi dolan ödenmemiş siparişler listede güncel görünsün (stok iade edilir)
  await releaseExpiredOrders().catch((err) => console.error("[admin/siparisler]", err));
  const [{ rows, total, pages }, badges] = await Promise.all([searchOrdersForAdmin({ q, filter, page }), getAdminBadges()]);
  // "Dikkat" filtresi yalnız ödeme uyarılı sipariş varken (ya da seçiliyken) görünür
  const filters = (Object.keys(ORDER_FILTERS) as OrderFilter[]).filter((f) => f !== "dikkat" || badges.attention > 0 || filter === "dikkat");

  const href = (next: { durum?: OrderFilter; sayfa?: number; q?: string }) => {
    const sp = new URLSearchParams();
    const f = next.durum ?? filter;
    if (f !== "tum") sp.set("durum", f);
    const query = next.q ?? q;
    if (query) sp.set("q", query);
    if (next.sayfa && next.sayfa > 1) sp.set("sayfa", String(next.sayfa));
    const s = sp.toString();
    return `/admin/siparisler${s ? `?${s}` : ""}`;
  };

  return (
    <AdminShell user={user} activeSection="siparisler">
      <div style={st.page}>
        <h1 style={st.h1}>Siparişler</h1>
        <p style={st.sub}>{total} sipariş</p>

        <form method="get" action="/admin/siparisler" style={st.search}>
          {filter !== "tum" && <input type="hidden" name="durum" value={filter} />}
          <input name="q" defaultValue={q} placeholder="Sipariş no, ad, e-posta ya da telefon" style={st.input} aria-label="Sipariş ara" />
          <button type="submit" style={st.btn}>
            Ara
          </button>
          {q && (
            <Link href={href({ q: "" })} style={st.clear}>
              Temizle
            </Link>
          )}
        </form>

        <nav style={st.filters} aria-label="Sipariş filtreleri">
          {filters.map((f) => (
            <Link key={f} href={href({ durum: f, sayfa: 1 })} style={{ ...st.filter, ...(filter === f ? st.filterOn : {}) }}>
              {ORDER_FILTERS[f]}
            </Link>
          ))}
        </nav>

        {rows.length === 0 ? (
          <p style={st.empty}>{q || filter !== "tum" ? "Bu ölçütlere uyan sipariş yok." : "Henüz sipariş yok."}</p>
        ) : (
          <ul className={rows_.list}>
            {rows.map((o) => {
              const status =
                o.status === "PENDING" && o.paymentMethod === "BANK_TRANSFER"
                  ? { label: "Havale bekleniyor", color: "#facc15" }
                  : STATUS[o.status] ?? { label: o.status, color: "#999" };
              return (
                <li key={o.id}>
                  <Link href={`/admin/siparisler/${o.id}`} className={rows_.row}>
                    <span className={rows_.main}>
                      <span className={rows_.name}>{o.name}</span>
                      <span className={rows_.meta}>
                        #{o.reference} · {dateTimeTr(o.createdAt)}
                      </span>
                    </span>
                    <span className={rows_.amount}>
                      <strong>{formatPrice(o.totalKurus)}</strong>
                      <span className={rows_.meta}>
                        {PAYMENT_METHOD_LABELS[o.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS]}
                        {o.recipientPays ? " · alıcı ödemeli kargo" : ""}
                      </span>
                    </span>
                    <span className={rows_.side}>
                      <span className={rows_.pill} style={{ background: `${status.color}20`, color: status.color }}>
                        {status.label}
                      </span>
                      {o.needsAttention && (
                        <span className={rows_.pill} style={{ background: "#fb923c30", color: "#fb923c" }}>
                          Dikkat
                        </span>
                      )}
                      {o.openRequests > 0 && (
                        <span className={rows_.pill} style={{ background: "#9ec5f025", color: "#9ec5f0" }}>
                          Talep
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {pages > 1 && (
          <nav style={st.pager} aria-label="Sayfalar">
            {page > 1 && (
              <Link href={href({ sayfa: page - 1 })} style={st.filter}>
                ‹ Önceki
              </Link>
            )}
            <span style={st.meta}>
              Sayfa {page} / {pages}
            </span>
            {page < pages && (
              <Link href={href({ sayfa: page + 1 })} style={st.filter}>
                Sonraki ›
              </Link>
            )}
          </nav>
        )}
      </div>
    </AdminShell>
  );
}

const st: Record<string, React.CSSProperties> = {
  page: { padding: "1.5rem clamp(1rem, 3vw, 2rem)", maxWidth: 1100 },
  h1: { margin: 0, fontSize: "1.5rem", fontWeight: 700, color: "#e8e4d9" },
  sub: { margin: "0.25rem 0 1rem", fontSize: "0.875rem", color: "rgba(232,228,217,0.5)" },
  search: { display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" },
  input: {
    flex: "1 1 260px",
    padding: "0.625rem 0.75rem",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "#e8e4d9",
    fontSize: "0.9375rem",
  },
  btn: { padding: "0.625rem 1rem", borderRadius: 8, border: 0, background: "#c4d68e", color: "#15180f", fontWeight: 600 },
  clear: { color: "rgba(232,228,217,0.6)", fontSize: "0.8125rem" },
  filters: { display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "1rem" },
  filter: {
    padding: "0.375rem 0.75rem",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(232,228,217,0.75)",
    textDecoration: "none",
    fontSize: "0.8125rem",
  },
  filterOn: { background: "rgba(196,214,142,0.15)", borderColor: "rgba(196,214,142,0.4)", color: "#e8e4d9" },
  empty: { padding: "3rem 0", textAlign: "center", color: "rgba(232,228,217,0.45)" },
  meta: { fontSize: "0.75rem", color: "rgba(232,228,217,0.45)", wordBreak: "break-all" },
  pager: { display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", marginTop: "1.25rem" },
};
