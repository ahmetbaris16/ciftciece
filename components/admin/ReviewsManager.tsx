"use client";

/**
 * Admin — Mağaza yorumları (ana sayfa). Kısa liste; düzenleme ve yeni yorum formu tıklayınca açılır.
 * Google yorumlarını aktarırken yazar, puan, metin ve tarih Google'daki hâliyle aynen girilmeli.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface AdminReview {
  id: string;
  authorName: string;
  rating: number;
  text: string;
  date: string; // YYYY-MM-DD
  source: string | null;
  isPublished: boolean;
  sortOrder: number;
}

type Draft = Omit<AdminReview, "id">;

const EMPTY: Draft = {
  authorName: "",
  rating: 5,
  text: "",
  date: new Date().toISOString().slice(0, 10),
  source: "google",
  isPublished: true,
  sortOrder: 0,
};

const SOURCE_TR: Record<string, string> = { google: "Google", manual: "Mağaza müşterisi" };

const dateTr = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(d);
};

export default function ReviewsManager({ initial }: { initial: AdminReview[] }) {
  const router = useRouter();
  const [reviews, setReviews] = useState(initial);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const call = async (method: string, body?: unknown, query = "") => {
    const res = await fetch(`/api/admin/reviews${query}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? "İşlem başarısız.");
    return data;
  };

  const save = async (r: AdminReview, after?: string) => {
    setBusy(r.id);
    setMsg(null);
    try {
      await call("PUT", { ...r, source: r.source || null });
      setReviews((list) => list.map((x) => (x.id === r.id ? r : x)));
      setEditing(null);
      setMsg({ ok: true, text: after ?? `${r.authorName} kaydedildi.` });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (r: AdminReview) => {
    if (!window.confirm(`${r.authorName} yorumunu silmek istiyor musunuz?`)) return;
    setBusy(r.id);
    setMsg(null);
    try {
      await call("DELETE", undefined, `?id=${encodeURIComponent(r.id)}`);
      setReviews((list) => list.filter((x) => x.id !== r.id));
      setMsg({ ok: true, text: "Yorum silindi." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    setBusy("new");
    setMsg(null);
    try {
      const { review } = await call("POST", { ...draft, source: draft.source || undefined });
      setReviews((list) => [...list, { ...draft, id: review.id }]);
      setDraft(EMPTY);
      setEditing(null);
      setMsg({ ok: true, text: "Yorum eklendi." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const patch = (id: string, p: Partial<AdminReview>) =>
    setReviews((list) => list.map((r) => (r.id === id ? { ...r, ...p } : r)));

  return (
    <div style={s.wrap}>
      {msg && (
        <p role="status" style={{ ...s.msg, color: msg.ok ? "#9fd39f" : "#f3a0a0" }}>
          {msg.text}
        </p>
      )}

      <ul style={s.list}>
        {reviews.map((r) => (
          <li key={r.id} style={s.row}>
            <div style={s.rowHead}>
              <span style={s.stars} aria-label={`5 üzerinden ${r.rating}`}>
                {"★".repeat(r.rating)}
                {"☆".repeat(Math.max(0, 5 - r.rating))}
              </span>
              <strong style={{ color: "#e8e4d9" }}>{r.authorName}</strong>
              <span style={s.meta}>
                {r.source ? `${SOURCE_TR[r.source] ?? r.source} · ` : ""}
                {dateTr(r.date)}
              </span>
              <span style={{ ...s.pill, ...(r.isPublished ? s.pillOn : {}) }}>{r.isPublished ? "Yayında" : "Gizli"}</span>
            </div>
            {r.text && editing !== r.id && <p style={s.text}>{r.text.length > 180 ? `${r.text.slice(0, 180).trimEnd()}…` : r.text}</p>}
            {editing === r.id ? (
              <>
                <Fields value={r} onChange={(p) => patch(r.id, p)} />
                <div style={s.actions}>
                  <button type="button" style={s.primary} disabled={busy === r.id} onClick={() => save(r)}>
                    {busy === r.id ? "Kaydediliyor…" : "Kaydet"}
                  </button>
                  <button type="button" style={s.ghost} onClick={() => setEditing(null)}>
                    Vazgeç
                  </button>
                  <button type="button" style={s.danger} disabled={busy === r.id} onClick={() => remove(r)}>
                    Sil
                  </button>
                </div>
              </>
            ) : (
              <div style={s.actions}>
                <button type="button" style={s.ghost} onClick={() => setEditing(r.id)}>
                  Düzenle
                </button>
                <button
                  type="button"
                  style={s.ghost}
                  disabled={busy === r.id}
                  onClick={() =>
                    save({ ...r, isPublished: !r.isPublished }, r.isPublished ? "Yorum sitede gizlendi." : "Yorum sitede yayınlandı.")
                  }
                >
                  {r.isPublished ? "Sitede gizle" : "Sitede yayınla"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {editing === "new" ? (
        <div style={{ ...s.row, borderStyle: "dashed" }}>
          <p style={s.title}>Yeni yorum</p>
          <Fields value={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
          <div style={s.actions}>
            <button type="button" style={s.primary} disabled={busy === "new"} onClick={add}>
              {busy === "new" ? "Ekleniyor…" : "Ekle"}
            </button>
            <button type="button" style={s.ghost} onClick={() => setEditing(null)}>
              Vazgeç
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button type="button" style={s.ghost} onClick={() => setEditing("new")}>
            + Yeni yorum ekle
          </button>
        </div>
      )}
    </div>
  );
}

function Fields({ value, onChange }: { value: Draft; onChange: (p: Partial<Draft>) => void }) {
  return (
    <div style={s.grid}>
      <label style={s.field}>
        <span style={s.label}>Yazar</span>
        <input style={s.input} value={value.authorName} onChange={(e) => onChange({ authorName: e.target.value })} />
      </label>
      <label style={s.field}>
        <span style={s.label}>Puan</span>
        <select style={s.input} value={value.rating} onChange={(e) => onChange({ rating: Number(e.target.value) })}>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {"★".repeat(n)} ({n})
            </option>
          ))}
        </select>
      </label>
      <label style={s.field}>
        <span style={s.label}>Tarih</span>
        <input type="date" style={s.input} value={value.date} onChange={(e) => onChange({ date: e.target.value })} />
      </label>
      <label style={s.field}>
        <span style={s.label}>Kaynak</span>
        <select style={s.input} value={value.source ?? ""} onChange={(e) => onChange({ source: e.target.value || null })}>
          <option value="google">Google</option>
          <option value="manual">Mağaza müşterisi</option>
          <option value="">Belirtilmedi</option>
        </select>
      </label>
      <label style={{ ...s.field, gridColumn: "1 / -1" }}>
        <span style={s.label}>Yorum metni (boş bırakılabilir: yalnız yıldız)</span>
        <textarea style={{ ...s.input, minHeight: 64 }} value={value.text} onChange={(e) => onChange({ text: e.target.value })} />
      </label>
      <label style={s.check}>
        <input type="checkbox" checked={value.isPublished} onChange={(e) => onChange({ isPublished: e.target.checked })} />
        Sitede yayınla
      </label>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 820 },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 },
  row: { padding: "0.9rem 1rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 },
  rowHead: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" },
  stars: { color: "#e8c07a", letterSpacing: "0.04em" },
  meta: { fontSize: "0.8125rem", color: "rgba(232,228,217,0.5)" },
  pill: {
    marginLeft: "auto",
    padding: "0.1rem 0.5rem",
    borderRadius: 999,
    fontSize: "0.75rem",
    fontWeight: 600,
    background: "rgba(255,255,255,0.07)",
    color: "rgba(232,228,217,0.6)",
  },
  pillOn: { background: "rgba(159,211,159,0.12)", color: "#9fd39f" },
  text: { margin: "0.4rem 0 0", fontSize: "0.875rem", lineHeight: 1.5, color: "rgba(232,228,217,0.8)" },
  title: { margin: "0 0 0.75rem", fontWeight: 600, color: "#e8e4d9" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem", alignItems: "end", marginTop: "0.75rem" },
  field: { display: "flex", flexDirection: "column", gap: "0.3rem" },
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
  check: { display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", color: "rgba(232,228,217,0.8)" },
  actions: { display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" },
  primary: { padding: "0.45rem 0.95rem", background: "#c4d68e", color: "#15180f", border: 0, borderRadius: 8, fontWeight: 600, fontSize: "0.8125rem" },
  ghost: {
    padding: "0.45rem 0.95rem",
    background: "transparent",
    color: "#c4d68e",
    border: "1px solid rgba(196,214,142,0.4)",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: "0.8125rem",
  },
  danger: { padding: "0.45rem 0.95rem", background: "rgba(239,68,68,0.12)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: "0.8125rem" },
  msg: { margin: 0, fontSize: "0.875rem" },
};
