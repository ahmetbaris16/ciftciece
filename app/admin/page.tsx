/**
 * Admin — Panel: bekleyen işler, özet, azalan stok ve yayın / banka incelemesi kontrol listesi.
 */

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/AdminShell";
import { getAdminBadges, getDashboardStats, getLaunchChecklist, type CheckState } from "@/lib/admin/dashboard";
import { formatPrice } from "@/types";

export const dynamic = "force-dynamic";

const STATE_STYLE: Record<CheckState, { label: string; color: string; bg: string }> = {
  ok: { label: "Tamam", color: "#9fd39f", bg: "rgba(159,211,159,0.12)" },
  todo: { label: "Yapılacak", color: "#e8c07a", bg: "rgba(232,192,122,0.12)" },
  manual: { label: "Elle kontrol", color: "#9ec5f0", bg: "rgba(158,197,240,0.12)" },
};

export default async function AdminDashboardPage() {
  const user = await requireAdmin();
  const [badges, stats, checklist] = await Promise.all([getAdminBadges(), getDashboardStats(), getLaunchChecklist()]);
  const todo = checklist.filter((c) => c.state === "todo").length;

  const tasks = [
    { n: badges.attention, text: "ödeme uyarısı — karar bekliyor", href: "/admin/siparisler?durum=dikkat", urgent: true },
    { n: badges.toShip, text: "sipariş hazırlanıp kargolanacak", href: "/admin/siparisler?durum=kargolanacak" },
    { n: badges.pendingTransfers, text: "sipariş havale bekliyor — hesabınızı kontrol edin", href: "/admin/siparisler?durum=havale" },
    { n: badges.openRequests, text: "müşteri iptal/iade talebi", href: "/admin/siparisler?durum=talep" },
    { n: badges.newMessages, text: "okunmamış mesaj", href: "/admin/mesajlar" },
    { n: badges.pendingReviews, text: "onay bekleyen ürün değerlendirmesi", href: "/admin/yorumlar" },
    { n: badges.failedEmails, text: "gönderilemeyen e-posta", href: "/admin/epostalar?durum=FAILED", urgent: true },
  ].filter((t) => t.n > 0);

  return (
    <AdminShell user={user} activeSection="dashboard">
      <div style={s.page}>
        <h1 style={s.h1}>Merhaba{user.name ? `, ${user.name}` : ""}</h1>
        <p style={s.sub}>Bugün yapılacaklar ve mağazanın durumu.</p>

        <section style={s.card}>
          <h2 style={s.h2}>Bekleyen işler</h2>
          {tasks.length === 0 ? (
            <p style={s.muted}>Bekleyen iş yok. 🎉</p>
          ) : (
            <ul style={s.tasks}>
              {tasks.map((t) => (
                <li key={t.href}>
                  <Link href={t.href} style={{ ...s.task, ...(t.urgent ? s.taskUrgent : {}) }}>
                    <strong style={s.taskN}>{t.n}</strong>
                    <span>{t.text}</span>
                    <span aria-hidden="true" style={s.chev}>›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div style={s.tiles}>
          <Tile label="Bugünkü siparişler" value={String(stats.todayOrders)} />
          <Tile label="Bu ay ödenen" value={formatPrice(stats.monthRevenueKurus)} hint={`${stats.monthPaidOrders} sipariş`} />
          <Tile label="Kargoda" value={String(stats.shipped)} />
        </div>

        {stats.lowStock.length > 0 && (
          <section style={s.card}>
            <h2 style={s.h2}>Azalan stok</h2>
            <ul style={s.list}>
              {stats.lowStock.map((l, i) => (
                <li key={i} style={s.listRow}>
                  <span>
                    {l.productName} <span style={s.muted}>({l.variantName})</span>
                  </span>
                  <strong style={{ color: l.quantity === 0 ? "#f3a0a0" : "#e8c07a" }}>{l.quantity === 0 ? "Tükendi" : `${l.quantity} adet`}</strong>
                </li>
              ))}
            </ul>
            <Link href="/admin/urunler" style={s.link}>
              Stokları güncelle
            </Link>
          </section>
        )}

        <section style={s.card}>
          <h2 style={s.h2}>Yayın ve banka incelemesi kontrol listesi</h2>
          <p style={s.muted}>
            {todo === 0 ? "Kodla denetlenebilen maddeler tamam." : `${todo} madde yapılacak.`} Akbank sanal POS incelemesinden önce bu
            listeyi tamamlayın.
          </p>
          <ul style={s.list}>
            {checklist.map((c) => {
              const st = STATE_STYLE[c.state];
              const body = (
                <>
                  <span style={{ ...s.pill, color: st.color, background: st.bg }}>{st.label}</span>
                  <span style={{ flex: 1 }}>
                    <strong style={{ display: "block", color: "#e8e4d9" }}>{c.label}</strong>
                    <span style={s.muted}>{c.detail}</span>
                  </span>
                </>
              );
              return (
                <li key={c.label} style={s.checkRow}>
                  {c.href ? (
                    <Link href={c.href} style={s.checkLink}>
                      {body}
                    </Link>
                  ) : (
                    <div style={s.checkLink}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </AdminShell>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={s.tile}>
      <span style={s.tileLabel}>{label}</span>
      <strong style={s.tileValue}>{value}</strong>
      {hint && <span style={s.muted}>{hint}</span>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: "1.5rem clamp(1rem, 3vw, 2rem)", maxWidth: 980 },
  h1: { margin: 0, fontSize: "1.625rem", fontWeight: 700, color: "#e8e4d9" },
  sub: { margin: "0.25rem 0 1.5rem", color: "rgba(232,228,217,0.55)", fontSize: "0.9375rem" },
  card: {
    padding: "1.25rem",
    marginBottom: "1rem",
    borderRadius: 12,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  h2: { margin: "0 0 0.75rem", fontSize: "1rem", fontWeight: 600, color: "#e8e4d9" },
  muted: { color: "rgba(232,228,217,0.55)", fontSize: "0.8125rem", lineHeight: 1.5 },
  tasks: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 },
  task: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.75rem 0.875rem",
    borderRadius: 10,
    background: "rgba(196,214,142,0.08)",
    color: "#e8e4d9",
    textDecoration: "none",
    fontSize: "0.9375rem",
  },
  taskUrgent: { background: "rgba(251,146,60,0.12)" },
  taskN: { minWidth: 28, fontSize: "1.125rem" },
  chev: { marginLeft: "auto", color: "rgba(232,228,217,0.4)", fontSize: "1.25rem" },
  tiles: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1rem" },
  tile: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "1rem 1.25rem",
    borderRadius: 12,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  tileLabel: { fontSize: "0.8125rem", color: "rgba(232,228,217,0.55)" },
  tileValue: { fontSize: "1.5rem", color: "#e8e4d9" },
  list: { listStyle: "none", margin: "0.5rem 0 0.75rem", padding: 0, display: "flex", flexDirection: "column", gap: 4 },
  listRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "1rem",
    padding: "0.5rem 0",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    fontSize: "0.875rem",
  },
  link: { color: "#c4d68e", fontSize: "0.875rem" },
  checkRow: { borderBottom: "1px solid rgba(255,255,255,0.05)" },
  checkLink: {
    display: "flex",
    gap: "0.75rem",
    alignItems: "flex-start",
    padding: "0.75rem 0",
    color: "inherit",
    textDecoration: "none",
    fontSize: "0.875rem",
  },
  pill: { flexShrink: 0, padding: "0.125rem 0.5rem", borderRadius: 999, fontSize: "0.6875rem", fontWeight: 700, marginTop: 2 },
};
