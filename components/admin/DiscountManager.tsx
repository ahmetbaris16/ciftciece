"use client";

/**
 * Admin — İndirimler: süren indirimler (bitiş gününü değiştir / Bitir), yeni indirim (oran, bitiş günü, ürün seçimi,
 * fiyat önizlemesi) ve geçmiş. Oranı ve süreyi yönetici belirler (yalnız %1–99 ve gelecekte bir bitiş günü). Önizlemedeki eski fiyat sunucunun hesapladığı "son 10 günün en düşük fiyatı"dır; indirim başlarken sunucu
 * aynı hesabı yeniden yapar (istemcinin gönderdiği fiyat kullanılmaz).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatPrice } from "@/types";
import { MAX_PERCENT, MIN_PERCENT, formatDiscountPeriod, istanbulDate, salePrice } from "@/lib/pricing/discount";
import s from "./DiscountManager.module.css";

export interface PickerProduct {
  id: string;
  name: string;
  slug: string;
  category: string;
  published: boolean;
  /** Süren indirimin oranı (varsa) */
  activePercent: number | null;
  variants: Array<{ id: string; name: string; priceKurus: number; referenceKurus: number }>;
}

export interface DiscountRow {
  id: string;
  productName: string;
  productSlug: string;
  percent: number;
  startsAt: string;
  endsAt: string;
  endedAt: string | null;
  items: Array<{ variantName: string; referenceKurus: number; saleKurus: number }>;
}

const QUICK = [5, 10, 15, 20, 25];

export default function DiscountManager({
  products,
  active,
  past,
  today,
  defaultEnd,
}: {
  products: PickerProduct[];
  active: DiscountRow[];
  past: DiscountRow[];
  /** İstanbul takviminde bugün / varsayılan bitiş (YYYY-MM-DD) */
  today: string;
  defaultEnd: string;
}) {
  const router = useRouter();
  const [percentText, setPercentText] = useState("10");
  const [endsOn, setEndsOn] = useState(defaultEnd);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [ending, setEnding] = useState<string | null>(null);
  // Bitiş günü değiştirilen süren indirim
  const [endEdit, setEndEdit] = useState<{ id: string; value: string } | null>(null);
  const [savingEnd, setSavingEnd] = useState(false);

  const percent = Number(percentText.replace(",", "."));
  const percentValid = Number.isInteger(percent) && percent >= MIN_PERCENT && percent <= MAX_PERCENT;

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return products.filter((p) => !q || p.name.toLocaleLowerCase("tr-TR").includes(q) || p.category.toLocaleLowerCase("tr-TR").includes(q));
  }, [products, query]);

  const groups = useMemo(() => {
    const map = new Map<string, PickerProduct[]>();
    for (const p of visible) map.set(p.category, [...(map.get(p.category) ?? []), p]);
    return [...map.entries()];
  }, [visible]);

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.includes(p.id));
  const toggleVisible = () =>
    setSelected((cur) =>
      allVisibleSelected ? cur.filter((id) => !visible.some((p) => p.id === id)) : [...new Set([...cur, ...visible.map((p) => p.id)])]
    );

  const start = async () => {
    setStatus(null);
    if (!percentValid) return setStatus({ kind: "error", text: `İndirim oranını %${MIN_PERCENT} ile %${MAX_PERCENT} arasında bir tam sayı olarak yazın.` });
    if (selected.length === 0) return setStatus({ kind: "error", text: "İndirim yapılacak ürünü seçin." });
    if (!endsOn) return setStatus({ kind: "error", text: "Bitiş tarihini seçin." });
    const replacing = products.filter((p) => selected.includes(p.id) && p.activePercent !== null).length;
    const question =
      `${selected.length} üründe %${percent} indirim şimdi başlasın mı? Bitiş: ${formatEnd(endsOn)}.` +
      (replacing > 0 ? `\n${replacing} üründe süren indirim bu indirimle değişecek.` : "");
    if (!window.confirm(question)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: selected, percent, endsOn }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return setStatus({ kind: "error", text: data?.error ?? "İndirim başlatılamadı." });
      const r = data.result as { started: Array<{ name: string }>; skipped: Array<{ name: string; reason: string }> };
      const parts = [];
      if (r.started.length > 0) parts.push(`${r.started.length} üründe %${percent} indirim başladı; sitede görünüyor.`);
      for (const sk of r.skipped) parts.push(`${sk.name}: ${sk.reason}`);
      setStatus({ kind: r.started.length > 0 ? "ok" : "error", text: parts.join(" ") });
      if (r.started.length > 0) setSelected([]);
      router.refresh();
    } catch {
      setStatus({ kind: "error", text: "Bağlantı hatası. Tekrar deneyin." });
    } finally {
      setBusy(false);
    }
  };

  const end = async (row: DiscountRow) => {
    if (!window.confirm(`“${row.productName}” indirimi şimdi bitsin mi? Ürün eski fiyatına döner.`)) return;
    setEnding(row.id);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/discounts/${row.id}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) setStatus({ kind: "error", text: data?.error ?? "İndirim bitirilemedi." });
      else setStatus({ kind: "ok", text: `“${row.productName}” indirimi bitti; ürün eski fiyatında.` });
      router.refresh();
    } catch {
      setStatus({ kind: "error", text: "Bağlantı hatası. Tekrar deneyin." });
    } finally {
      setEnding(null);
    }
  };

  const saveEnd = async (row: DiscountRow) => {
    if (!endEdit || endEdit.id !== row.id) return;
    if (!endEdit.value) return setStatus({ kind: "error", text: "Yeni bitiş gününü seçin." });
    setSavingEnd(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/discounts/${row.id}/end-date`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endsOn: endEdit.value }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return setStatus({ kind: "error", text: data?.error ?? "Bitiş günü değiştirilemedi." });
      setStatus({ kind: "ok", text: `“${row.productName}” indirimi ${formatEnd(endEdit.value)} bitecek; sitede yeni tarih yazıyor.` });
      setEndEdit(null);
      router.refresh();
    } catch {
      setStatus({ kind: "error", text: "Bağlantı hatası. Tekrar deneyin." });
    } finally {
      setSavingEnd(false);
    }
  };

  return (
    <div className={s.wrap}>
      {status && (
        <p role="status" className={status.kind === "ok" ? s.ok : s.error}>
          {status.text}
        </p>
      )}

      <section className={s.card} aria-labelledby="suren">
        <h2 id="suren" className={s.h2}>
          Süren indirimler {active.length > 0 && <span className={s.count}>{active.length}</span>}
        </h2>
        {active.length === 0 ? (
          <p className={s.muted}>Şu an süren indirim yok.</p>
        ) : (
          <ul className={s.rows}>
            {active.map((row) => (
              <li key={row.id} className={s.row}>
                <div className={s.rowMain}>
                  <p className={s.rowTitle}>
                    <span className={s.pill}>%{row.percent}</span>
                    <Link href={`/urun/${row.productSlug}`} target="_blank" className={s.link}>
                      {row.productName}
                    </Link>
                  </p>
                  <p className={s.muted}>
                    {formatDiscountPeriod(row.startsAt, row.endsAt)} ·{" "}
                    {row.items.map((i) => `${i.variantName}: ${formatPrice(i.referenceKurus)} → ${formatPrice(i.saleKurus)}`).join(" · ")}
                  </p>
                </div>
                {endEdit?.id === row.id ? (
                  <div className={s.rowActions}>
                    <label className={s.endField}>
                      <span className={s.label}>Yeni bitiş günü</span>
                      <input
                        className={s.input}
                        type="date"
                        value={endEdit.value}
                        min={today}
                        onChange={(e) => setEndEdit({ id: row.id, value: e.target.value })}
                      />
                    </label>
                    <button type="button" className={s.neutralBtn} onClick={() => saveEnd(row)} disabled={savingEnd}>
                      {savingEnd ? "Kaydediliyor…" : "Kaydet"}
                    </button>
                    <button type="button" className={s.linkBtn} onClick={() => setEndEdit(null)} disabled={savingEnd}>
                      Vazgeç
                    </button>
                  </div>
                ) : (
                  <div className={s.rowActions}>
                    <button
                      type="button"
                      className={s.neutralBtn}
                      onClick={() => setEndEdit({ id: row.id, value: istanbulDate(new Date(row.endsAt)) })}
                    >
                      Bitiş gününü değiştir
                    </button>
                    <button type="button" className={s.secondaryBtn} onClick={() => end(row)} disabled={ending === row.id}>
                      {ending === row.id ? "Bitiriliyor…" : "Bitir"}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={s.card} aria-labelledby="yeni">
        <h2 id="yeni" className={s.h2}>
          Yeni indirim
        </h2>

        <div className={s.fields}>
          <label className={s.field}>
            <span className={s.label}>İndirim oranı (%)</span>
            <span className={s.percentRow}>
              <input
                className={s.input}
                inputMode="numeric"
                value={percentText}
                onChange={(e) => setPercentText(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
                aria-invalid={!percentValid || undefined}
              />
              {QUICK.map((q) => (
                <button key={q} type="button" className={`${s.chip} ${percent === q ? s.chipOn : ""}`} onClick={() => setPercentText(String(q))}>
                  %{q}
                </button>
              ))}
            </span>
          </label>
          <label className={s.field}>
            <span className={s.label}>Bitiş günü (o günün sonunda biter)</span>
            <input className={s.input} type="date" value={endsOn} min={today} onChange={(e) => setEndsOn(e.target.value)} />
          </label>
        </div>

        <div className={s.pickerHead}>
          <input
            className={s.input}
            placeholder="Ürün ya da kategori ara"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Ürün ara"
          />
          <button type="button" className={s.linkBtn} onClick={toggleVisible}>
            {allVisibleSelected ? "Seçimi kaldır" : query ? "Bulunanların hepsini seç" : "Tüm ürünleri seç"}
          </button>
        </div>

        <div className={s.picker}>
          {groups.length === 0 && <p className={s.muted}>Bu aramaya uyan ürün yok.</p>}
          {groups.map(([category, list]) => (
            <fieldset key={category} className={s.group}>
              <legend className={s.groupTitle}>{category}</legend>
              {list.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <label key={p.id} className={`${s.option} ${on ? s.optionOn : ""}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(p.id)} />
                    <span className={s.optionMain}>
                      <span className={s.optionName}>
                        {p.name}
                        {!p.published && <span className={s.tag}>Taslak</span>}
                        {p.activePercent !== null && <span className={s.tagSale}>şu an %{p.activePercent}</span>}
                      </span>
                      <span className={s.prices}>
                        {p.variants.length === 0
                          ? "Fiyatı girilmiş seçeneği yok"
                          : p.variants
                              .map((v) =>
                                on && percentValid
                                  ? `${v.name}: ${formatPrice(v.referenceKurus)} → ${formatPrice(salePrice(v.referenceKurus, percent))}`
                                  : `${v.name}: ${formatPrice(v.priceKurus)}`
                              )
                              .join(" · ")}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </div>

        <div className={s.footer}>
          <button type="button" className={s.primaryBtn} onClick={start} disabled={busy}>
            {busy ? "Başlatılıyor…" : selected.length > 0 ? `${selected.length} üründe indirimi başlat` : "İndirimi başlat"}
          </button>
          <p className={s.hint}>
            İndirim hemen başlar ve seçtiğiniz günün sonunda kendiliğinden biter; bitiş gününü sonra da değiştirebilirsiniz. Sitede eski fiyat
            üstü çizili, yeni fiyat ve &quot;%{percentValid ? percent : "…"} İndirim&quot; etiketiyle görünür; kampanya tarihleri ürün
            sayfasında yazar. Eski fiyat olarak ürünün son 10 gündeki en düşük satış fiyatı kullanılır (yasal kural).
          </p>
        </div>
      </section>

      {past.length > 0 && (
        <details className={s.card}>
          <summary className={s.summary}>Geçmiş indirimler ({past.length})</summary>
          <ul className={s.rows}>
            {past.map((row) => (
              <li key={row.id} className={s.row}>
                <div className={s.rowMain}>
                  <p className={s.rowTitle}>
                    <span className={s.pillPast}>%{row.percent}</span>
                    {row.productName}
                  </p>
                  <p className={s.muted}>
                    {formatDiscountPeriod(row.startsAt, row.endedAt ?? row.endsAt)}
                    {row.endedAt && row.endedAt < row.endsAt ? " (erken bitirildi)" : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function formatEnd(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00+03:00`);
  return `${new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric" }).format(d)} gün sonu`;
}
