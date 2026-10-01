"use client";

/**
 * Admin — Ürün değerlendirmeleri (üye müşterilerin ürün sayfasından yazdıkları)
 * Onay bekleyenler üstte. Onayla → ürün sayfasında yayınlanır; Reddet → yayınlanmaz (müşteri
 * Hesabım'da "Yayınlanmadı" görür, düzenleyip tekrar gönderebilir); Sil → kalıcı.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminProductReview, ReviewStatus } from "@/lib/repositories/product-review.repository";

const FILTERS: Array<{ key: ReviewStatus | "ALL"; label: string }> = [
  { key: "PENDING", label: "Onay bekleyen" },
  { key: "APPROVED", label: "Yayında" },
  { key: "REJECTED", label: "Reddedilen" },
  { key: "ALL", label: "Tümü" },
];

const STATUS_STYLE: Record<ReviewStatus, { label: string; color: string; bg: string }> = {
  PENDING: { label: "Onay bekliyor", color: "#f5d27a", bg: "rgba(245,210,122,0.12)" },
  APPROVED: { label: "Yayında", color: "#9fd39f", bg: "rgba(159,211,159,0.12)" },
  REJECTED: { label: "Reddedildi", color: "#f3a0a0", bg: "rgba(243,160,160,0.12)" },
};

const dateFmt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" });

export default function ProductReviewsManager({ initial }: { initial: AdminProductReview[] }) {
  const router = useRouter();
  const [reviews, setReviews] = useState(initial);
  const [filter, setFilter] = useState<ReviewStatus | "ALL">(
    initial.some((r) => r.status === "PENDING") ? "PENDING" : "ALL"
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const counts = useMemo(() => {
    const c = { PENDING: 0, APPROVED: 0, REJECTED: 0, ALL: reviews.length };
    for (const r of reviews) c[r.status]++;
    return c;
  }, [reviews]);

  const shown = reviews
    .filter((r) => filter === "ALL" || r.status === filter)
    .sort((a, b) => Number(b.status === "PENDING") - Number(a.status === "PENDING") || b.updatedAt.localeCompare(a.updatedAt));

  const call = async (method: "PATCH" | "DELETE", body?: unknown, query = "") => {
    const res = await fetch(`/api/admin/product-reviews${query}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? "İşlem başarısız.");
    return data;
  };

  const moderate = async (r: AdminProductReview, status: "APPROVED" | "REJECTED") => {
    setBusy(r.id);
    setMsg(null);
    try {
      const adminNote = notes[r.id]?.trim() || undefined;
      await call("PATCH", { id: r.id, status, adminNote });
      setReviews((list) =>
        list.map((x) => (x.id === r.id ? { ...x, status, adminNote: adminNote ?? null, updatedAt: new Date().toISOString() } : x))
      );
      setMsg({ ok: true, text: status === "APPROVED" ? "Değerlendirme yayına alındı." : "Değerlendirme reddedildi." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (r: AdminProductReview) => {
    if (!window.confirm(`${r.customerName} kişisinin "${r.productName}" değerlendirmesi kalıcı olarak silinsin mi?`)) return;
    setBusy(r.id);
    setMsg(null);
    try {
      await call("DELETE", undefined, `?id=${encodeURIComponent(r.id)}`);
      setReviews((list) => list.filter((x) => x.id !== r.id));
      setMsg({ ok: true, text: "Değerlendirme silindi." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.filters} role="tablist" aria-label="Değerlendirme durumu">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            style={{ ...s.filter, ...(filter === f.key ? s.filterActive : {}) }}
            onClick={() => setFilter(f.key)}
          >
            {f.label} <span style={s.count}>{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {msg && (
        <p role="status" style={{ ...s.msg, color: msg.ok ? "#9fd39f" : "#f3a0a0" }}>
          {msg.text}
        </p>
      )}

      {shown.length === 0 && (
        <p style={s.empty}>
          {filter === "PENDING" ? "Onay bekleyen değerlendirme yok." : "Bu durumda değerlendirme yok."}
        </p>
      )}

      {shown.map((r) => {
        const st = STATUS_STYLE[r.status];
        return (
          <article key={r.id} style={s.card}>
            <header style={s.head}>
              <div style={{ minWidth: 0 }}>
                <a href={r.productSlug ? `/urun/${r.productSlug}#degerlendirmeler` : undefined} target="_blank" rel="noreferrer" style={s.product}>
                  {r.productName}
                </a>
                <p style={s.meta}>
                  {r.customerName} · {r.customerEmail} · {dateFmt.format(new Date(r.updatedAt))}
                  {r.isVerifiedPurchase && <span style={s.verified}> · ✓ Satın aldı</span>}
                </p>
              </div>
              <span style={{ ...s.status, color: st.color, background: st.bg }}>{st.label}</span>
            </header>

            <p style={s.stars} aria-label={`${r.rating} yıldız`}>
              {"★".repeat(r.rating)}
              <span style={{ opacity: 0.25 }}>{"★".repeat(5 - r.rating)}</span>
            </p>
            {r.title && <p style={s.title}>{r.title}</p>}
            <p style={s.text}>{r.text}</p>

            <label style={s.noteField}>
              <span style={s.label}>Not (yalnız siz görürsünüz; ör. reddetme sebebi)</span>
              <input
                style={s.input}
                value={notes[r.id] ?? r.adminNote ?? ""}
                maxLength={300}
                onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
              />
            </label>

            <div style={s.actions}>
              {r.status !== "APPROVED" && (
                <button type="button" style={s.primary} disabled={busy === r.id} onClick={() => moderate(r, "APPROVED")}>
                  {busy === r.id ? "…" : "Onayla ve yayınla"}
                </button>
              )}
              {r.status !== "REJECTED" && (
                <button type="button" style={s.secondary} disabled={busy === r.id} onClick={() => moderate(r, "REJECTED")}>
                  {r.status === "APPROVED" ? "Yayından kaldır" : "Reddet"}
                </button>
              )}
              <button type="button" style={s.danger} disabled={busy === r.id} onClick={() => remove(r)}>
                Sil
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 820 },
  filters: { display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.25rem" },
  filter: {
    padding: "0.45rem 0.85rem",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 999,
    color: "rgba(232,228,217,0.75)",
    fontSize: "0.8125rem",
    fontWeight: 500,
  },
  filterActive: { background: "rgba(196,214,142,0.16)", borderColor: "rgba(196,214,142,0.45)", color: "#c4d68e" },
  count: { marginLeft: 4, opacity: 0.7, fontVariantNumeric: "tabular-nums" },
  msg: { margin: 0, fontSize: "0.875rem" },
  empty: { margin: 0, padding: "1.25rem", color: "rgba(232,228,217,0.55)", border: "1px dashed rgba(255,255,255,0.12)", borderRadius: 12 },
  card: { padding: "1.25rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" },
  product: { color: "#e8e4d9", fontWeight: 600, textDecoration: "none" },
  meta: { margin: "0.25rem 0 0", fontSize: "0.75rem", color: "rgba(232,228,217,0.5)", overflowWrap: "anywhere" },
  verified: { color: "#9fd39f" },
  status: { flexShrink: 0, padding: "0.2rem 0.6rem", borderRadius: 999, fontSize: "0.75rem", fontWeight: 600 },
  stars: { margin: "0.75rem 0 0", color: "#e3c35a", letterSpacing: 2 },
  title: { margin: "0.4rem 0 0", fontWeight: 600, color: "#e8e4d9" },
  text: { margin: "0.35rem 0 0", color: "rgba(232,228,217,0.85)", fontSize: "0.9rem", lineHeight: 1.6, whiteSpace: "pre-line", overflowWrap: "anywhere" },
  noteField: { display: "flex", flexDirection: "column", gap: "0.3rem", marginTop: "1rem" },
  label: { fontSize: "0.75rem", color: "rgba(232,228,217,0.55)" },
  input: {
    padding: "0.5rem 0.625rem",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    color: "#e8e4d9",
    fontSize: "0.875rem",
    fontFamily: "inherit",
  },
  actions: { display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "1rem" },
  primary: { padding: "0.5rem 1rem", background: "#c4d68e", color: "#15180f", border: 0, borderRadius: 8, fontWeight: 600, fontSize: "0.8125rem" },
  secondary: { padding: "0.5rem 1rem", background: "transparent", color: "#e8e4d9", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, fontSize: "0.8125rem" },
  danger: { padding: "0.5rem 1rem", background: "rgba(239,68,68,0.12)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: "0.8125rem" },
};
