/**
 * Admin — Mesajlar: iletişim formundan gelenler. Bekleyen / yanıtlanan / arşiv; yanıt işletmenin e-posta
 * adresinden gider ve mesajın altında görünür.
 */

import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/AdminShell";
import MessageActions from "@/components/admin/MessageActions";
import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";
import { contactReplyKeyPrefix } from "@/lib/contact/replies";
import { EMAIL_STATUS_TR } from "@/lib/email/kinds";
import { formatPhoneTr } from "@/lib/business/info";

export const dynamic = "force-dynamic";

const FILTERS: Record<string, { label: string; where: Prisma.ContactMessageWhereInput }> = {
  acik: { label: "Bekleyenler", where: { status: { in: ["NEW", "READ"] } } },
  yanitlandi: { label: "Yanıtlananlar", where: { status: "ANSWERED" } },
  arsiv: { label: "Arşiv", where: { status: "ARCHIVED" } },
  tum: { label: "Tümü", where: {} },
};

const STATUS_TR: Record<string, { label: string; color: string }> = {
  NEW: { label: "Yeni", color: "#e8c07a" },
  READ: { label: "Okundu", color: "#9ec5f0" },
  ANSWERED: { label: "Yanıtlandı", color: "#9fd39f" },
  ARCHIVED: { label: "Arşiv", color: "rgba(232,228,217,0.5)" },
};

const dateTimeTr = (d: Date) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d);

export default async function AdminMesajlarPage({ searchParams }: { searchParams: Promise<{ durum?: string; gonderildi?: string }> }) {
  const user = await requireAdmin();
  const { durum, gonderildi } = await searchParams;
  const filter = durum && durum in FILTERS ? durum : "acik";

  const messages = USE_DB
    ? await prisma.contactMessage.findMany({ where: FILTERS[filter].where, orderBy: { createdAt: "desc" }, take: 100 })
    : [];
  const replies = messages.length
    ? await prisma.emailMessage.findMany({
        where: { OR: messages.map((m) => ({ dedupeKey: { startsWith: contactReplyKeyPrefix(m.id) } })) },
        orderBy: { createdAt: "asc" },
        select: { dedupeKey: true, status: true, sentAt: true, createdAt: true, text: true },
      })
    : [];
  const repliesOf = (id: string) => replies.filter((r) => r.dedupeKey.startsWith(contactReplyKeyPrefix(id)));

  return (
    <AdminShell user={user} activeSection="mesajlar">
      <div style={st.page}>
        <h1 style={st.h1}>Mesajlar</h1>
        <p style={st.sub}>İletişim formundan gelen mesajlar. Yanıtlarınız işletmenin e-posta adresinden gider.</p>

        {gonderildi && (
          <p style={st.sent} role="status">
            Yanıtınız gönderildi; mesaj “Yanıtlananlar” bölümüne taşındı.
          </p>
        )}

        <nav style={st.filters} aria-label="Mesaj filtreleri">
          {Object.entries(FILTERS).map(([k, v]) => (
            <Link
              key={k}
              href={k === "acik" ? "/admin/mesajlar" : `/admin/mesajlar?durum=${k}`}
              style={{ ...st.filter, ...(filter === k ? st.filterOn : {}) }}
            >
              {v.label}
            </Link>
          ))}
        </nav>

        {messages.length === 0 ? (
          <p style={st.empty}>{filter === "acik" ? "Bekleyen mesaj yok." : "Bu bölümde mesaj yok."}</p>
        ) : (
          <ul style={st.list}>
            {messages.map((m) => {
              const status = STATUS_TR[m.status] ?? { label: m.status, color: "#999" };
              const rs = repliesOf(m.id);
              return (
                <li key={m.id} style={{ ...st.card, ...(m.status === "NEW" ? st.cardNew : {}) }}>
                  <div style={st.head}>
                    <div style={{ minWidth: 0 }}>
                      <p style={st.subject}>{m.subject}</p>
                      <p style={st.meta}>
                        {m.name} ·{" "}
                        <a href={`mailto:${m.email}`} style={st.a}>
                          {m.email}
                        </a>
                        {m.phone && (
                          <>
                            {" "}
                            ·{" "}
                            <a href={`tel:${m.phone}`} style={st.a}>
                              {formatPhoneTr(m.phone)}
                            </a>
                          </>
                        )}
                        {m.orderReference && (
                          <>
                            {" "}
                            · sipariş{" "}
                            <Link href={`/admin/siparisler/${encodeURIComponent(m.orderReference)}`} style={st.a}>
                              #{m.orderReference}
                            </Link>
                          </>
                        )}
                      </p>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <span style={{ ...st.pill, color: status.color }}>{status.label}</span>
                      <p style={st.meta}>{dateTimeTr(m.createdAt)}</p>
                    </div>
                  </div>
                  <p style={st.body}>{m.message}</p>
                  {rs.length > 0 && (
                    <div style={st.replies}>
                      {rs.map((r) => {
                        const es = EMAIL_STATUS_TR[r.status] ?? { label: r.status, color: "#999" };
                        return (
                          <details key={r.dedupeKey} style={st.reply}>
                            <summary style={{ cursor: "pointer" }}>
                              Yanıtınız · {dateTimeTr(r.sentAt ?? r.createdAt)} · <span style={{ color: es.color }}>{es.label}</span>
                            </summary>
                            <p style={{ ...st.body, fontSize: "0.8125rem", margin: "0.5rem 0 0" }}>{r.text}</p>
                          </details>
                        );
                      })}
                    </div>
                  )}
                  <MessageActions id={m.id} status={m.status} email={m.email} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}

const st: Record<string, React.CSSProperties> = {
  page: { padding: "1.5rem clamp(1rem, 3vw, 2rem)", maxWidth: 900, color: "#e8e4d9" },
  h1: { margin: 0, fontSize: "1.5rem", fontWeight: 700 },
  sub: { margin: "0.25rem 0 1rem", fontSize: "0.875rem", color: "rgba(232,228,217,0.55)" },
  filters: { display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "1rem" },
  sent: { margin: "0 0 1rem", padding: "0.65rem 0.9rem", borderRadius: 10, background: "rgba(159,211,159,0.1)", color: "#9fd39f", fontSize: "0.875rem" },
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
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 },
  card: { padding: "1rem 1.15rem", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" },
  cardNew: { borderColor: "rgba(232,192,122,0.45)" },
  head: { display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "0.6rem" },
  subject: { margin: 0, fontWeight: 650, fontSize: "1rem" },
  meta: { margin: "0.2rem 0 0", fontSize: "0.8125rem", color: "rgba(232,228,217,0.55)", wordBreak: "break-word" },
  a: { color: "#c4d68e" },
  pill: { padding: "0.125rem 0.5rem", borderRadius: 999, fontSize: "0.75rem", fontWeight: 700, background: "rgba(255,255,255,0.06)" },
  body: { margin: "0 0 0.85rem", whiteSpace: "pre-wrap", lineHeight: 1.55, fontSize: "0.9375rem", wordBreak: "break-word" },
  replies: { margin: "0 0 0.85rem", display: "flex", flexDirection: "column", gap: 6 },
  reply: { padding: "0.5rem 0.75rem", borderRadius: 8, background: "rgba(196,214,142,0.06)", fontSize: "0.8125rem", color: "rgba(232,228,217,0.75)" },
};
