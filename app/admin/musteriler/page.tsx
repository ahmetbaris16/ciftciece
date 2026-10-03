/**
 * Admin — Müşteriler: sipariş veren herkes (misafir + üye) ve sipariş vermemiş üyeler; Tümü / Üyeler / Misafirler,
 * arama, sayfalama. Satıra tıklayınca müşteri sayfası açılır (bilgiler, siparişler, talepler, üyelik işlemleri).
 */

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/AdminShell";
import { CUSTOMER_FILTERS, listCustomers, parseCustomerFilter, type CustomerFilter } from "@/lib/admin/customers";
import { formatPrice } from "@/types";
import { formatPhoneTr } from "@/lib/business/info";
import rows_ from "@/components/admin/AdminRows.module.css";

export const dynamic = "force-dynamic";

const dateTr = (d: Date) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "Europe/Istanbul" }).format(d);

interface Props {
  searchParams: Promise<{ q?: string; tur?: string; sayfa?: string }>;
}

export default async function AdminMusterilerPage({ searchParams }: Props) {
  const user = await requireAdmin();
  const params = await searchParams;
  const q = params.q ?? "";
  const filter = parseCustomerFilter(params.tur);
  const page = Number(params.sayfa) || 1;
  const { rows, total, pages, members } = await listCustomers({ q, filter, page });
  const href = (next: { tur?: CustomerFilter; sayfa?: number; q?: string }) => {
    const sp = new URLSearchParams();
    const f = next.tur ?? filter;
    if (f !== "tum") sp.set("tur", f);
    const query = next.q ?? q;
    if (query) sp.set("q", query);
    if (next.sayfa && next.sayfa > 1) sp.set("sayfa", String(next.sayfa));
    const s = sp.toString();
    return `/admin/musteriler${s ? `?${s}` : ""}`;
  };

  return (
    <AdminShell user={user} activeSection="musteriler">
      <div style={st.page}>
        <h1 style={st.h1}>Müşteriler</h1>
        <p style={st.sub}>
          {q || filter !== "tum" ? `${total} sonuç` : `${total} müşteri`} · {members} üye hesabı. Müşteri verisi yalnız sipariş ve iletişim için
          kullanılır; kampanya e-postası için ayrıca açık onay ve İYS kaydı gerekir.
        </p>

        <form method="get" action="/admin/musteriler" style={st.search}>
          {filter !== "tum" && <input type="hidden" name="tur" value={filter} />}
          <input name="q" defaultValue={q} placeholder="Ad, e-posta ya da telefon" style={st.input} aria-label="Müşteri ara" />
          <button type="submit" style={st.btn}>
            Ara
          </button>
          {q && (
            <Link href={href({ q: "" })} style={st.clear}>
              Temizle
            </Link>
          )}
        </form>

        <nav style={st.filters} aria-label="Müşteri türü">
          {(Object.keys(CUSTOMER_FILTERS) as CustomerFilter[]).map((f) => (
            <Link
              key={f}
              href={href({ tur: f, sayfa: 1 })}
              style={{ ...st.filter, ...(filter === f ? st.filterOn : {}) }}
              aria-current={filter === f ? "page" : undefined}
            >
              {CUSTOMER_FILTERS[f]}
            </Link>
          ))}
        </nav>

        {rows.length === 0 ? (
          <p style={st.empty}>
            {q || filter !== "tum" ? "Bu ölçütlere uyan müşteri yok." : "Henüz müşteri yok: ilk sipariş ya da üyelikle burada görünür."}
          </p>
        ) : (
          <ul className={rows_.list}>
            {rows.map((c) => (
              <li key={c.key}>
                <Link href={`/admin/musteriler/${c.key}`} className={rows_.row}>
                  <span className={rows_.main}>
                    <span className={rows_.name}>
                      {c.name ?? "—"}
                      {c.member && <span style={st.member}>Üye</span>}
                      {c.staff && (
                        <span style={st.staff} title="Bu e-posta yönetici hesabına ait: aynı e-postayla mağazaya üye girişi yapılamaz.">
                          Yönetici hesabı
                        </span>
                      )}
                    </span>
                    <span className={rows_.meta}>
                      {c.email}
                      {c.phone ? ` · ${formatPhoneTr(c.phone)}` : ""}
                    </span>
                  </span>
                  <span className={rows_.amount}>
                    <strong title="Alınan ödemeler eksi iadeler; demo/test ödemeleri sayılmaz">{formatPrice(c.netKurus)}</strong>
                    <span className={rows_.meta}>
                      {c.orders > 0 ? `${c.orders} sipariş` : "Sipariş yok"}
                      {c.refundedKurus > 0 ? ` · ${formatPrice(c.refundedKurus)} iade` : ""}
                    </span>
                  </span>
                  <span className={rows_.side}>
                    {c.lastOrderAt ? (
                      <>
                        <span className={rows_.meta}>Son sipariş</span>
                        <span>{dateTr(c.lastOrderAt)}</span>
                      </>
                    ) : c.memberSince ? (
                      <>
                        <span className={rows_.meta}>Üye oldu</span>
                        <span>{dateTr(c.memberSince)}</span>
                      </>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {rows.length > 0 && <p style={st.foot}>Tutar: alınan ödemeler eksi iadeler. Demo ve test ödemeleri gerçek para olmadığı için sayılmaz.</p>}

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
  page: { padding: "1.5rem clamp(1rem, 3vw, 2rem)", maxWidth: 1000, color: "#e8e4d9" },
  h1: { margin: 0, fontSize: "1.5rem", fontWeight: 700 },
  sub: { margin: "0.25rem 0 1rem", fontSize: "0.875rem", lineHeight: 1.5, color: "rgba(232,228,217,0.55)" },
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
  member: { padding: "0.05rem 0.4rem", borderRadius: 4, fontSize: "0.6875rem", fontWeight: 700, background: "rgba(196,214,142,0.15)", color: "#c4d68e" },
  staff: { padding: "0.05rem 0.4rem", borderRadius: 4, fontSize: "0.6875rem", fontWeight: 700, background: "rgba(245,196,107,0.14)", color: "#f5c46b" },
  foot: { margin: "0.75rem 0 0", fontSize: "0.75rem", color: "rgba(232,228,217,0.45)" },
  meta: { fontSize: "0.75rem", color: "rgba(232,228,217,0.5)", wordBreak: "break-all" },
  pager: { display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", marginTop: "1.25rem" },
};
