/**
 * Admin — Panel: bekleyen işler, sipariş süreci şeridi (her aşamada kaç sipariş; tıklayınca o aşamanın listesi),
 * kısa özet, azalan stok ve (varsa) yönetici panelinden tamamlanacak kurulum eksikleri. Sunucu/banka tarafındaki
 * teknik kontroller Ayarlar'ın sonundaki yayın öncesi listededir.
 */

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/AdminShell";
import { getAdminBadges, getDashboardStats, getLaunchChecklist } from "@/lib/admin/dashboard";
import { ORDER_FILTERS, countOrdersByFilter, type OrderFilter } from "@/lib/admin/orders";
import { formatPrice } from "@/types";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const user = await requireAdmin();
  const [badges, stats, checklist, stages] = await Promise.all([
    getAdminBadges(),
    getDashboardStats(),
    getLaunchChecklist(),
    countOrdersByFilter(),
  ]);
  const setup = checklist.filter((c) => c.state === "todo" && !c.technical);

  const tasks = [
    { n: badges.attention, text: "ödeme uyarısı: karar bekliyor", href: "/admin/siparisler?durum=dikkat", urgent: true },
    { n: badges.toShip, text: "sipariş hazırlanıp kargolanacak", href: "/admin/siparisler?durum=kargolanacak" },
    { n: badges.pendingTransfers, text: "sipariş havale bekliyor: hesabınızı kontrol edin", href: "/admin/siparisler?durum=odeme" },
    { n: badges.openRequests, text: "müşteri iptal/iade talebi", href: "/admin/siparisler?durum=talep" },
    { n: badges.newMessages, text: "yeni mesaj", href: "/admin/mesajlar" },
    { n: badges.failedEmails, text: "e-posta gönderilemedi", href: "/admin/epostalar?durum=FAILED", urgent: true },
  ].filter((t) => t.n > 0);

  return (
    <AdminShell user={user} activeSection="dashboard">
      <div style={s.page}>
        <h1 style={s.h1}>Merhaba{user.name ? `, ${user.name}` : ""}</h1>
        <p style={s.sub}>Bugün yapılacaklar ve mağazanın durumu.</p>

        <section style={s.card}>
          <h2 style={s.h2}>Bekleyen işler</h2>
          {tasks.length === 0 ? (
            <p style={s.muted}>Bekleyen iş yok.</p>
          ) : (
            <ul style={s.tasks}>
              {tasks.map((t) => (
                <li key={t.href}>
                  <Link href={t.href} style={{ ...s.task, ...(t.urgent ? s.taskUrgent : {}) }}>
                    <strong style={s.taskN}>{t.n}</strong>
                    <span>{t.text}</span>
                    <span aria-hidden="true" style={s.chev}>
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section style={s.card} aria-labelledby="surec">
          <h2 id="surec" style={s.h2}>
            Sipariş süreci
          </h2>
          <ol style={s.flow}>
            {PIPELINE.map((f, i) => (
              <li key={f} style={s.flowItem}>
                <Link href={`/admin/siparisler?durum=${f}`} style={{ ...s.stage, ...(stages[f] > 0 && f !== "teslim" ? s.stageOn : {}) }}>
                  <strong style={s.stageN}>{stages[f]}</strong>
                  <span>{ORDER_FILTERS[f]}</span>
                </Link>
                {i < PIPELINE.length - 1 && (
                  <span aria-hidden="true" style={s.flowArrow}>
                    ›
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p style={{ ...s.muted, margin: "0.75rem 0 0" }}>
            Kapıda ödemeli sipariş doğrudan &quot;Kargolanacak&quot;a düşer.
            {stages.talep > 0 ? ` ${stages.talep} siparişte müşteri talebi karar bekliyor.` : ""}{" "}
            <Link href="/admin/siparisler?durum=iptal" style={s.link}>
              İptal / iade ({stages.iptal})
            </Link>
          </p>
        </section>

        <div style={s.tiles}>
          <Tile label="Bugünkü siparişler" value={String(stats.todayOrders)} />
          <Tile
            label="Bu ay alınan ödeme"
            value={formatPrice(stats.monthRevenueKurus)}
            hint={stats.monthRefundKurus > 0 ? `iade ${formatPrice(stats.monthRefundKurus)}` : undefined}
          />
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

        {setup.length > 0 && (
          <section style={s.card}>
            <h2 style={s.h2}>Kurulumu tamamlayın</h2>
            <ul style={s.list}>
              {setup.map((c) => (
                <li key={c.label}>
                  <Link href={c.href ?? "/admin/ayarlar"} style={s.setupRow}>
                    <strong style={{ color: "#e8e4d9" }}>{c.label}</strong>
                    <span style={s.muted}>{c.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AdminShell>
  );
}

/** Panelde gösterilen ana akış (talep, iptal ve dikkat ayrı) */
const PIPELINE: OrderFilter[] = ["odeme", "kargolanacak", "kargoda", "teslim"];

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
  list: { listStyle: "none", margin: "0.25rem 0 0.75rem", padding: 0, display: "flex", flexDirection: "column", gap: 4 },
  listRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "1rem",
    padding: "0.5rem 0",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    fontSize: "0.875rem",
  },
  setupRow: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "0.6rem 0",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    color: "inherit",
    textDecoration: "none",
    fontSize: "0.875rem",
  },
  link: { color: "#c4d68e", fontSize: "0.875rem" },
  flow: { listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 6 },
  flowItem: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 },
  stage: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "0.75rem 0.875rem",
    borderRadius: 10,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(232,228,217,0.75)",
    textDecoration: "none",
    fontSize: "0.875rem",
    minWidth: 0,
  },
  stageOn: { background: "rgba(196,214,142,0.08)", borderColor: "rgba(196,214,142,0.35)", color: "#e8e4d9" },
  stageN: { fontSize: "1.375rem", color: "#e8e4d9", fontVariantNumeric: "tabular-nums" },
  flowArrow: { color: "rgba(232,228,217,0.35)", fontSize: "1.25rem" },
};
