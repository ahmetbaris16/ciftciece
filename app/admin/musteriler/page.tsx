/**
 * Admin — Müşteriler: sipariş veren herkes (misafir + üye), e-posta adresine göre. Satıra tıklayınca o
 * müşterinin siparişleri listelenir.
 */

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/AdminShell";
import { listCustomers } from "@/lib/admin/customers";
import { formatPrice } from "@/types";
import { formatPhoneTr } from "@/lib/business/info";
import rows_ from "@/components/admin/AdminRows.module.css";

export const dynamic = "force-dynamic";

const dateTr = (d: Date) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "Europe/Istanbul" }).format(d);

export default async function AdminMusterilerPage({ searchParams }: { searchParams: Promise<{ q?: string; sayfa?: string }> }) {
  const user = await requireAdmin();
  const params = await searchParams;
  const q = params.q ?? "";
  const page = Number(params.sayfa) || 1;
  const { rows, total, pages, members } = await listCustomers({ q, page });
  const href = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (p > 1) sp.set("sayfa", String(p));
    const s = sp.toString();
    return `/admin/musteriler${s ? `?${s}` : ""}`;
  };

  return (
    <AdminShell user={user} activeSection="musteriler">
      <div style={st.page}>
        <h1 style={st.h1}>Müşteriler</h1>
        <p style={st.sub}>
          Sipariş veren {total} kişi · {members} üye hesabı. Müşteri verisi yalnız sipariş ve iletişim için kullanılır; kampanya e-postası
          için ayrıca açık onay ve İYS kaydı gerekir.
        </p>

        <form method="get" action="/admin/musteriler" style={st.search}>
          <input name="q" defaultValue={q} placeholder="Ad, e-posta ya da telefon" style={st.input} aria-label="Müşteri ara" />
          <button type="submit" style={st.btn}>
            Ara
          </button>
          {q && (
            <Link href="/admin/musteriler" style={st.clear}>
              Temizle
            </Link>
          )}
        </form>

        {rows.length === 0 ? (
          <p style={st.empty}>{q ? "Aramaya uyan müşteri yok." : "Henüz sipariş veren müşteri yok."}</p>
        ) : (
          <ul className={rows_.list}>
            {rows.map((c) => (
              <li key={c.email}>
                <Link href={`/admin/siparisler?q=${encodeURIComponent(c.email)}`} className={rows_.row}>
                  <span className={rows_.main}>
                    <span className={rows_.name}>
                      {c.name ?? "—"}
                      {c.member && <span style={st.member}>Üye</span>}
                    </span>
                    <span className={rows_.meta}>
                      {c.email}
                      {c.phone ? ` · ${formatPhoneTr(c.phone)}` : ""}
                    </span>
                  </span>
                  <span className={rows_.amount}>
                    <strong>{formatPrice(c.paidKurus)}</strong>
                    <span className={rows_.meta}>
                      {c.paidOrders} ödenmiş / {c.orders} sipariş
                    </span>
                  </span>
                  <span className={rows_.side}>
                    <span className={rows_.meta}>Son sipariş</span>
                    <span>{dateTr(c.lastOrderAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {pages > 1 && (
          <nav style={st.pager} aria-label="Sayfalar">
            {page > 1 && (
              <Link href={href(page - 1)} style={st.pageLink}>
                ‹ Önceki
              </Link>
            )}
            <span style={st.meta}>
              Sayfa {page} / {pages}
            </span>
            {page < pages && (
              <Link href={href(page + 1)} style={st.pageLink}>
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
  search: { display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" },
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
  empty: { padding: "3rem 0", textAlign: "center", color: "rgba(232,228,217,0.45)" },
  member: { padding: "0.05rem 0.4rem", borderRadius: 4, fontSize: "0.6875rem", fontWeight: 700, background: "rgba(196,214,142,0.15)", color: "#c4d68e" },
  meta: { fontSize: "0.75rem", color: "rgba(232,228,217,0.5)", wordBreak: "break-all" },
  pager: { display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", marginTop: "1.25rem" },
  pageLink: {
    padding: "0.375rem 0.75rem",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(232,228,217,0.75)",
    textDecoration: "none",
    fontSize: "0.8125rem",
  },
};
