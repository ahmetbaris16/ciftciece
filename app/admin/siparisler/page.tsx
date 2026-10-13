/**
 * Admin — Siparişler. Açılınca "Yeni siparişler" (ödemesi alınmış, kargolanacak); yoksa "Şu an kargolanacak yeni
 * sipariş yok". Sekmeler: (gerekirse) Dikkat, Müşteri talebi, Havale bekleyen → Yeni siparişler → Kargoda → Teslim
 * edildi → İptal / iade → Tümü; seçili sekmenin altında ne olduğu ve ne yapılacağı yazar (lib/admin/orders.ts).
 * Arama her zaman bütün siparişlerde yapılır. Her satırda sıradaki iş yazar. Tarihler İstanbul saatiyle.
 */

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { releaseExpiredOrders } from "@/lib/repositories";
import AdminShell from "@/components/admin/AdminShell";
import { formatPrice } from "@/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment/methods";
import {
  DEFAULT_ORDER_FILTER,
  OPTIONAL_ORDER_FILTERS,
  ORDER_FILTERS,
  ORDER_FILTER_EMPTY,
  ORDER_FILTER_HELP,
  countOrdersByFilter,
  nextStepHint,
  parseFilter,
  searchOrdersForAdmin,
  type OrderFilter,
} from "@/lib/admin/orders";
import rows_ from "@/components/admin/AdminRows.module.css";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; color: string }> = {
  PAID: { label: "Ödendi", color: "#4ade80" },
  PROCESSING: { label: "Hazırlanıyor", color: "#60a5fa" },
  SHIPPED: { label: "Kargoda", color: "#a78bfa" },
  DELIVERED: { label: "Teslim edildi", color: "#34d399" },
  CANCELLED: { label: "İptal edildi", color: "#f87171" },
  REFUNDED: { label: "İade edildi", color: "#fb923c" },
};

/** Ödemesi beklenen sipariş: havalede "Havale bekleniyor", kartta müşteri banka sayfasında vazgeçmiş */
function statusOf(o: { status: string; paymentMethod: string }) {
  if (o.status === "PENDING") {
    return o.paymentMethod === "BANK_TRANSFER"
      ? { label: "Havale bekleniyor", color: "#facc15" }
      : { label: "Ödeme yarım kaldı", color: "#a8a29e" };
  }
  return STATUS[o.status] ?? { label: o.status, color: "#999" };
}

const dateTimeTr = (d: Date) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d);

interface Props {
  searchParams: Promise<{ q?: string; durum?: string; sayfa?: string }>;
}

export default async function AdminSiparislerPage({ searchParams }: Props) {
  const user = await requireAdmin();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  // Arama bütün siparişlerde (aranan sipariş başka sekmede diye "bulunamadı" denmesin)
  const filter: OrderFilter = q ? "tum" : parseFilter(params.durum);
  const page = Number(params.sayfa) || 1;
  // Süresi dolan ödenmemiş siparişler listede güncel görünsün (stok iade edilir)
  await releaseExpiredOrders().catch((err) => console.error("[admin/siparisler]", err));
  const [{ rows, total, pages }, counts] = await Promise.all([searchOrdersForAdmin({ q, filter, page }), countOrdersByFilter()]);
  const filters = (Object.keys(ORDER_FILTERS) as OrderFilter[]).filter(
    (f) => !OPTIONAL_ORDER_FILTERS.includes(f) || counts[f] > 0 || filter === f
  );

  const href = (next: { durum?: OrderFilter; sayfa?: number; q?: string }) => {
    const sp = new URLSearchParams();
    const f = next.durum ?? filter;
    const query = next.q ?? q;
    if (query) sp.set("q", query);
    else if (f !== DEFAULT_ORDER_FILTER) sp.set("durum", f);
    if (next.sayfa && next.sayfa > 1) sp.set("sayfa", String(next.sayfa));
    const s = sp.toString();
    return `/admin/siparisler${s ? `?${s}` : ""}`;
  };

  return (
    <AdminShell user={user} activeSection="siparisler">
      <div style={st.page}>
        <h1 style={st.h1}>Siparişler</h1>

        <form method="get" action="/admin/siparisler" style={st.search} role="search">
          <input name="q" defaultValue={q} placeholder="Sipariş no, ad, e-posta, tel." style={st.input} aria-label="Sipariş ara" />
          <button type="submit" style={st.btn}>
            Ara
          </button>
          {q && (
            <Link href={href({ q: "", durum: DEFAULT_ORDER_FILTER })} style={st.clear}>
              Aramayı temizle
            </Link>
          )}
        </form>

        <nav style={st.filters} aria-label="Sipariş sekmeleri">
          {filters.map((f) => {
            const on = filter === f;
            // Sayı vurgusu: iş bekleyen sekmelerde (teslim, iptal ve tümü sadece bilgi)
            const busy = counts[f] > 0 && f !== "tum" && f !== "teslim" && f !== "iptal";
            return (
              <Link
                key={f}
                href={href({ durum: f, sayfa: 1, q: "" })}
                style={{ ...st.filter, ...(f === "dikkat" && counts.dikkat > 0 ? st.filterUrgent : {}), ...(on ? st.filterOn : {}) }}
                aria-current={on ? "page" : undefined}
              >
                {ORDER_FILTERS[f]}
                <span style={{ ...st.count, ...(busy ? st.countOn : {}) }}>{counts[f]}</span>
              </Link>
            );
          })}
        </nav>

        <p style={st.help}>{q ? `“${q}” için bütün siparişlerde ${total} sonuç.` : ORDER_FILTER_HELP[filter]}</p>

        {rows.length === 0 ? (
          <div style={st.empty}>
            <p style={st.emptyTitle}>{q ? "Aramanıza uyan sipariş yok." : ORDER_FILTER_EMPTY[filter]}</p>
            {!q && filter === DEFAULT_ORDER_FILTER && counts.tum > 0 && (
              <p style={st.emptyText}>
                Kargodaki ve teslim edilen siparişler kendi sekmelerinde;{" "}
                <Link href={href({ durum: "tum", q: "" })} style={st.link}>
                  hepsini görmek için Tümü
                </Link>
                .
              </p>
            )}
          </div>
        ) : (
          <ul className={rows_.list}>
            {rows.map((o) => {
              const status = statusOf(o);
              const hint = nextStepHint(o);
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
                      {hint && <span className={rows_.meta}>{hint}</span>}
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
  h1: { margin: "0 0 1rem", fontSize: "1.5rem", fontWeight: 700, color: "#e8e4d9" },
  search: { display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "0.875rem" },
  input: {
    flex: "1 1 220px",
    minWidth: 0,
    padding: "0.625rem 0.75rem",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "#e8e4d9",
    fontSize: "1rem",
  },
  btn: { padding: "0.625rem 1rem", borderRadius: 8, border: 0, background: "#c4d68e", color: "#15180f", fontWeight: 600, fontSize: "0.9375rem" },
  clear: { color: "rgba(232,228,217,0.6)", fontSize: "0.8125rem" },
  filters: { display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "0.625rem" },
  filter: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 36,
    padding: "0.375rem 0.75rem",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(232,228,217,0.75)",
    textDecoration: "none",
    fontSize: "0.8125rem",
    whiteSpace: "nowrap",
  },
  filterOn: { background: "rgba(196,214,142,0.15)", borderColor: "rgba(196,214,142,0.4)", color: "#e8e4d9" },
  filterUrgent: { borderColor: "rgba(251,146,60,0.45)", color: "#fdba74" },
  count: { marginLeft: "0.4rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "rgba(232,228,217,0.45)" },
  countOn: { color: "#c4d68e" },
  help: { margin: "0 0 1rem", fontSize: "0.875rem", lineHeight: 1.5, color: "rgba(232,228,217,0.6)", maxWidth: "70ch" },
  empty: { padding: "2.5rem 1rem", textAlign: "center", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 12 },
  emptyTitle: { margin: 0, fontSize: "1rem", fontWeight: 600, color: "rgba(232,228,217,0.8)" },
  emptyText: { margin: "0.5rem 0 0", fontSize: "0.875rem", color: "rgba(232,228,217,0.5)" },
  link: { color: "#c4d68e" },
  meta: { fontSize: "0.75rem", color: "rgba(232,228,217,0.45)", wordBreak: "break-all" },
  pager: { display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", marginTop: "1.25rem" },
};
