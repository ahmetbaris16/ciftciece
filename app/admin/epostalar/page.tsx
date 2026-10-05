/**
 * Admin — E-postalar: gönderim ayarının durumu, deneme e-postası, kuyruğu şimdi gönder, tüm e-postalar
 * (müşteriye ve işletmeye) durumlarıyla; gönderilemeyenler yeniden gönderilebilir.
 */

import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/AdminShell";
import EmailTools from "@/components/admin/EmailTools";
import EmailRequeueButton from "@/components/admin/order/EmailRequeueButton";
import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";
import { emailConfigWarnings, emailMode, smtpConfigFromEnv } from "@/lib/email/config";
import { EMAIL_STATUS_TR, emailKindLabel } from "@/lib/email/kinds";
import { getBusinessInfo } from "@/lib/business/business.repository";

export const dynamic = "force-dynamic";

const FILTERS: Record<string, { label: string; where: Prisma.EmailMessageWhereInput }> = {
  tum: { label: "Tümü", where: {} },
  FAILED: { label: "Gönderilemeyen", where: { status: "FAILED" } },
  QUEUED: { label: "Kuyrukta", where: { status: { in: ["QUEUED", "SENDING"] } } },
  SENT: { label: "Gönderilen", where: { status: "SENT" } },
  CANCELLED: { label: "İptal", where: { status: "CANCELLED" } },
};

const PER_PAGE = 50;

const dateTimeTr = (d: Date) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d);

export default async function AdminEpostalarPage({ searchParams }: { searchParams: Promise<{ durum?: string; sayfa?: string }> }) {
  const user = await requireAdmin();
  const params = await searchParams;
  const filter = params.durum && params.durum in FILTERS ? params.durum : "tum";
  const page = Math.max(1, Number(params.sayfa) || 1);

  const mode = emailMode();
  const smtp = smtpConfigFromEnv();
  const warnings = emailConfigWarnings();
  const business = await getBusinessInfo();

  const where = FILTERS[filter].where;
  const [total, rows, counts] = USE_DB
    ? await Promise.all([
        prisma.emailMessage.count({ where }),
        prisma.emailMessage.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * PER_PAGE,
          take: PER_PAGE,
          select: {
            id: true,
            kind: true,
            audience: true,
            toAddress: true,
            subject: true,
            status: true,
            attempts: true,
            availableAt: true,
            sentAt: true,
            lastError: true,
            createdAt: true,
            orderId: true,
          },
        }),
        prisma.emailMessage.groupBy({ by: ["status"], _count: { _all: true } }),
      ])
    : [0, [], []];
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (f: string, p = 1) => {
    const sp = new URLSearchParams();
    if (f !== "tum") sp.set("durum", f);
    if (p > 1) sp.set("sayfa", String(p));
    const s = sp.toString();
    return `/admin/epostalar${s ? `?${s}` : ""}`;
  };

  return (
    <AdminShell user={user} activeSection="ayarlar">
      <div style={st.page}>
        <Link href="/admin/ayarlar#eposta" style={st.back}>
          ‹ Ayarlar
        </Link>
        <h1 style={st.h1}>E-postalar</h1>
        <p style={st.sub}>Siteden müşterilere ve size giden tüm e-postalar. Hata olursa sistem kendisi yeniden dener.</p>

        <section style={st.card}>
          {mode === "smtp" && smtp ? (
            <p style={{ ...st.status, color: "#9fd39f" }}>
              Gönderim açık · {smtp.fromName} &lt;{smtp.fromAddress}&gt; · {smtp.host}:{smtp.port} {smtp.secure ? "(SSL)" : smtp.requireTLS ? "(STARTTLS)" : "(şifresiz)"}
            </p>
          ) : mode === "dev-outbox" ? (
            <p style={{ ...st.status, color: "#9ec5f0" }}>
              Geliştirme kipi: e-postalar gönderilmez, .mock-data/outbox.json dosyasına yazılır.
            </p>
          ) : (
            <p style={{ ...st.status, color: "#f3a0a0" }}>
              Gönderim ayarlı değil: e-postalar kuyrukta bekliyor, müşterilere gitmiyor. Hostinger&apos;da SMTP_HOST, SMTP_PORT, SMTP_USER,
              SMTP_PASS ve EMAIL_FROM ortam değişkenlerini girin (docs/YAYIN.md).
            </p>
          )}
          {warnings.length > 0 && mode === "smtp" && (
            <ul style={st.warnings}>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <p style={st.counts}>
            Kuyrukta {count("QUEUED") + count("SENDING")} · gönderilemeyen{" "}
            <span style={{ color: count("FAILED") ? "#f3a0a0" : undefined }}>{count("FAILED")}</span> · gönderilen {count("SENT")}
          </p>
          <EmailTools defaultTo={business.notificationEmail || business.email || user.email || ""} />
        </section>

        <nav style={st.filters} aria-label="E-posta filtreleri">
          {Object.entries(FILTERS).map(([k, v]) => (
            <Link key={k} href={href(k)} style={{ ...st.filter, ...(filter === k ? st.filterOn : {}) }}>
              {v.label}
            </Link>
          ))}
        </nav>

        {rows.length === 0 ? (
          <p style={st.empty}>Bu bölümde e-posta yok.</p>
        ) : (
          <ul style={st.list}>
            {rows.map((m) => {
              const es = EMAIL_STATUS_TR[m.status] ?? { label: m.status, color: "#999" };
              return (
                <li key={m.id} style={st.row}>
                  <div style={st.rowHead}>
                    <span style={{ color: es.color, fontWeight: 700 }}>{es.label}</span>
                    <span>{emailKindLabel(m.kind)}</span>
                    <span>· {m.audience === "store" ? `işletmeye (${m.toAddress})` : m.toAddress}</span>
                    <span>· {dateTimeTr(m.sentAt ?? m.createdAt)}</span>
                    {m.orderId && (
                      <Link href={`/admin/siparisler/${m.orderId}`} style={st.a}>
                        · siparişi aç
                      </Link>
                    )}
                  </div>
                  <p style={st.subject}>{m.subject}</p>
                  {m.status === "QUEUED" && m.attempts > 0 && (
                    <p style={st.muted}>
                      {m.attempts}. deneme başarısız; yeniden deneme {dateTimeTr(m.availableAt)}
                    </p>
                  )}
                  {m.status !== "SENT" && m.lastError && <p style={{ ...st.muted, color: "#f3a0a0" }}>{m.lastError}</p>}
                  {(m.status === "FAILED" || m.status === "CANCELLED") && <EmailRequeueButton emailId={m.id} />}
                </li>
              );
            })}
          </ul>
        )}

        {pages > 1 && (
          <nav style={st.pager} aria-label="Sayfalar">
            {page > 1 && (
              <Link href={href(filter, page - 1)} style={st.filter}>
                ‹ Önceki
              </Link>
            )}
            <span style={st.muted}>
              Sayfa {page} / {pages}
            </span>
            {page < pages && (
              <Link href={href(filter, page + 1)} style={st.filter}>
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
  back: { display: "inline-block", marginBottom: "0.75rem", color: "rgba(232,228,217,0.6)", fontSize: "0.875rem", textDecoration: "none" },
  page: { padding: "1.5rem clamp(1rem, 3vw, 2rem)", maxWidth: 980, color: "#e8e4d9" },
  h1: { margin: 0, fontSize: "1.5rem", fontWeight: 700 },
  sub: { margin: "0.25rem 0 1rem", fontSize: "0.875rem", color: "rgba(232,228,217,0.55)" },
  card: {
    padding: "1rem 1.15rem",
    marginBottom: "1rem",
    borderRadius: 12,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
  },
  status: { margin: "0 0 0.5rem", fontWeight: 600, fontSize: "0.9375rem", lineHeight: 1.5, wordBreak: "break-word" },
  warnings: { margin: "0 0 0.5rem", paddingLeft: "1.1rem", color: "#e8c07a", fontSize: "0.8125rem", lineHeight: 1.5 },
  counts: { margin: "0 0 0.85rem", fontSize: "0.8125rem", color: "rgba(232,228,217,0.6)" },
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
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 },
  row: { padding: "0.75rem 1rem", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" },
  rowHead: { display: "flex", flexWrap: "wrap", gap: "0.4rem", fontSize: "0.75rem", color: "rgba(232,228,217,0.55)", wordBreak: "break-all" },
  subject: { margin: "0.25rem 0 0", fontSize: "0.9375rem", wordBreak: "break-word" },
  muted: { margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "rgba(232,228,217,0.55)" },
  a: { color: "#c4d68e", textDecoration: "none" },
  pager: { display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", marginTop: "1.25rem" },
};
