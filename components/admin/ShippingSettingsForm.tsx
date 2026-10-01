"use client";

/**
 * Admin — Kargo ayarları (yalnız Yurtiçi Kargo)
 *
 * Kargo ücreti sabit değil: sepet dükkânın kolilerine yerleştirilir, her koli için ağırlık ile desi
 * karşılaştırılır, Yurtiçi tarifesinden fiyat alınır. Bunun için üç bilgi gerekir:
 *   1) Yurtiçi Kargo anlaşmalı desi tarifesi   2) kullanılan koliler   3) ürün paketlerinin ölçüleri
 * Biri eksikse eşik altındaki siparişlerde müşteriye rakam gösterilmez ("hesaplanamadı").
 * Hiçbir alanın varsayılan değeri yoktur — tahmini rakam girilmez, ölçüp/sözleşmeden alıp girin.
 */

import { useMemo, useState } from "react";
import { PACKAGING_TYPES } from "@/lib/shipping/packaging";
import { DESI_DIVISOR } from "@/lib/shipping/packing";
import type { PackagingMeasure, ShippingBox, ShippingSettings } from "@/lib/shipping/settings";

/** "1.250,50" / "1250.5" → sayı; boş → null; geçersiz → NaN */
const parseNum = (text: string): number | null => {
  const t = text.trim().replace(/\s/g, "");
  if (t === "") return null;
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};
const numText = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));
const tlText = (kurus: number | null) => (kurus === null ? "" : numText(kurus / 100));
const toKurus = (text: string) => {
  const n = parseNum(text);
  return n === null || Number.isNaN(n) ? n : Math.round(n * 100);
};

type BandRow = { key: number; desi: string; price: string };
type BoxRow = { id: string; name: string; l: string; w: string; h: string; maxKg: string; tareG: string };
type MeasureRow = { g: string; l: string; w: string; h: string; fragile: boolean };

let nextKey = 1;

export default function ShippingSettingsForm({ initial }: { initial: ShippingSettings }) {
  const [threshold, setThreshold] = useState(tlText(initial.freeThresholdKurus));
  const [bands, setBands] = useState<BandRow[]>(() =>
    initial.tariff.bands.map((b) => ({ key: nextKey++, desi: numText(b.maxDesi), price: tlText(b.priceKurus) }))
  );
  const [extra, setExtra] = useState(tlText(initial.tariff.extraPerDesiKurus));
  const [boxes, setBoxes] = useState<BoxRow[]>(() =>
    initial.boxes.map((b) => ({
      id: b.id,
      name: b.name,
      l: numText(b.lengthCm),
      w: numText(b.widthCm),
      h: numText(b.heightCm),
      maxKg: numText(b.maxGrams / 1000),
      tareG: numText(b.tareGrams),
    }))
  );
  const [measures, setMeasures] = useState<Record<string, MeasureRow>>(() =>
    Object.fromEntries(
      PACKAGING_TYPES.map((t) => {
        const m = initial.packaging[t.id];
        return [
          t.id,
          {
            g: numText(m?.grossGrams),
            l: numText(m?.lengthCm),
            w: numText(m?.widthCm),
            h: numText(m?.heightCm),
            fragile: m?.fragile ?? t.fragile,
          },
        ];
      })
    )
  );
  const [recipientPays, setRecipientPays] = useState(initial.recipientPaysWhenUnknown);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const setMeasure = (id: string, patch: Partial<MeasureRow>) =>
    setMeasures((m) => ({ ...m, [id]: { ...m[id], ...patch } }));
  const setBox = (i: number, patch: Partial<BoxRow>) =>
    setBoxes((b) => b.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const setBand = (key: number, patch: Partial<BandRow>) =>
    setBands((b) => b.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  // Hazırlık durumu (ücretli kargo için üç bilgi de gerekir)
  const readiness = useMemo(() => {
    const measured = PACKAGING_TYPES.filter((t) => {
      const m = measures[t.id];
      return [m.g, m.l, m.w, m.h].every((v) => {
        const n = parseNum(v);
        return n !== null && !Number.isNaN(n) && n > 0;
      });
    }).length;
    return {
      tariff: bands.some((b) => b.desi.trim() && b.price.trim()),
      // En az bir koli tüm alanlarıyla dolu olmalı
      boxes: boxes.some(
        (b) =>
          b.name.trim() !== "" &&
          [b.l, b.w, b.h, b.maxKg].every((v) => (parseNum(v) ?? 0) > 0) &&
          parseNum(b.tareG) !== null &&
          !Number.isNaN(parseNum(b.tareG))
      ),
      measured,
      total: PACKAGING_TYPES.length,
    };
  }, [bands, boxes, measures]);

  const save = async () => {
    setStatus(null);
    const err = (text: string) => setStatus({ kind: "error", text });

    const thresholdKurus = toKurus(threshold);
    if (thresholdKurus === null || Number.isNaN(thresholdKurus)) return err("Ücretsiz kargo eşiğini TL olarak girin (ör. 3000).");

    const tariffBands: ShippingSettings["tariff"]["bands"] = [];
    for (const b of bands) {
      if (!b.desi.trim() && !b.price.trim()) continue; // boş satır
      const maxDesi = parseNum(b.desi);
      const priceKurus = toKurus(b.price);
      if (!maxDesi || Number.isNaN(maxDesi)) return err("Tarife: her satırda desi (kg) üst sınırını girin.");
      if (priceKurus === null || Number.isNaN(priceKurus)) return err(`Tarife: ${b.desi} desi satırının ücretini girin.`);
      tariffBands.push({ maxDesi, priceKurus });
    }
    tariffBands.sort((a, b) => a.maxDesi - b.maxDesi);
    const extraKurus = toKurus(extra);
    if (Number.isNaN(extraKurus)) return err("İlave desi ücreti geçerli bir sayı olmalı.");

    const boxList: ShippingBox[] = [];
    for (const [i, b] of boxes.entries()) {
      const nums = [b.l, b.w, b.h, b.maxKg, b.tareG].map(parseNum);
      if (!b.name.trim() || nums.some((n) => n === null || Number.isNaN(n)) || nums.slice(0, 4).some((n) => !n)) {
        return err(`Koli ${i + 1}: ad, en/boy/yükseklik, taşıma sınırı ve koli ağırlığını girin.`);
      }
      const [l, w, h, maxKg, tareG] = nums as number[];
      boxList.push({
        id: b.id,
        name: b.name.trim(),
        lengthCm: l,
        widthCm: w,
        heightCm: h,
        maxGrams: Math.round(maxKg * 1000),
        tareGrams: Math.round(tareG),
      });
    }

    const packaging: Record<string, PackagingMeasure> = {};
    for (const t of PACKAGING_TYPES) {
      const m = measures[t.id];
      const nums = [m.g, m.l, m.w, m.h].map(parseNum);
      if (nums.every((n) => n === null)) continue; // ölçülmedi
      if (nums.some((n) => !n || Number.isNaN(n))) {
        return err(`${t.label}: brüt ağırlık ve üç ölçünün hepsini girin (ya da hepsini boş bırakın).`);
      }
      const [g, l, w, h] = nums as number[];
      packaging[t.id] = { grossGrams: Math.round(g), lengthCm: l, widthCm: w, heightCm: h, fragile: m.fragile };
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/shipping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freeThresholdKurus: thresholdKurus,
          tariff: { bands: tariffBands, extraPerDesiKurus: extraKurus },
          packaging,
          boxes: boxList,
          recipientPaysWhenUnknown: recipientPays,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return err(data?.error ?? "Kaydedilemedi.");
      setStatus({ kind: "ok", text: "Kargo ayarları kaydedildi." });
    } catch {
      err("Bağlantı hatası. Tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  const ready = readiness.tariff && readiness.boxes;

  return (
    <div style={s.wrap}>
      <p style={s.intro}>
        Kargo firması: <strong>Yurtiçi Kargo</strong> (yalnız yurt içi). Ücret sabit değildir: sepet kolilere yerleştirilir,
        her koli için gerçek ağırlık ile desi (en × boy × yükseklik / {DESI_DIVISOR}) karşılaştırılır, büyüğü tarifeden
        fiyatlanır. Aynı koliye sığan ürünlere ayrı ücret yazılmaz.
      </p>

      <div style={s.readiness} role="status">
        <Check ok={readiness.tariff} label="Yurtiçi tarifesi girildi" />
        <Check ok={readiness.boxes} label="Koliler girildi" />
        <Check
          ok={readiness.measured === readiness.total}
          label={`Ürün paket ölçüleri: ${readiness.measured} / ${readiness.total}`}
        />
        <span style={s.hint}>
          {ready
            ? "Sepetteki tüm ürünlerin ölçüsü girilmişse kargo ücreti otomatik hesaplanır."
            : "Bilgiler eksikken eşik altındaki siparişlerde kargo ücreti hesaplanamaz (ücretsiz kargo eşiği üstü etkilenmez)."}{" "}
          {recipientPays
            ? "Hesaplanamayan siparişler alıcı ödemeli gönderilir: müşteri kargo ücretini teslimatta öder."
            : "Hesaplanamayan siparişler çevrimiçi alınmaz (müşteriye telefon/WhatsApp gösterilir)."}
        </span>
      </div>

      <label style={s.checkRow}>
        <input type="checkbox" checked={recipientPays} onChange={(e) => setRecipientPays(e.target.checked)} />
        <span>
          <strong>Ücret hesaplanamazsa alıcı ödemeli gönder</strong>
          <span style={{ ...s.hint, display: "block" }}>
            Sipariş durmaz; müşteri yalnız ürünleri öder, kargo ücretini Yurtiçi Kargo görevlisine teslimatta öder. Bu
            siparişler admin sipariş sayfasında “ALICI ÖDEMELİ” diye işaretlenir — gönderiyi Yurtiçi’de alıcı ödemeli açın.
          </span>
        </span>
      </label>

      <label style={s.field}>
        <span style={s.label}>Ücretsiz kargo eşiği (TL)</span>
        <input style={s.input} inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        <span style={s.hint}>Ara toplam bu tutar ve üzerindeyse kargo ücretsiz.</span>
      </label>

      {/* 1) Tarife */}
      <section style={s.section}>
        <h3 style={s.h3}>1. Yurtiçi Kargo tarifesi</h3>
        <p style={s.hint}>
          Yurtiçi Kargo şubenizle yaptığınız anlaşmadaki desi/kg fiyatları (KDV dahil, müşteriden alınacak tutar). Her
          satır: “bu desiye kadar → ücret”.
        </p>
        <div style={s.table}>
          <div style={{ ...s.bandRow, ...s.th }}>
            <span>Desi/kg’a kadar</span>
            <span>Ücret (TL)</span>
            <span />
          </div>
          {bands.map((b) => (
            <div key={b.key} style={s.bandRow}>
              <input style={s.input} inputMode="decimal" aria-label="Desi üst sınırı" value={b.desi} onChange={(e) => setBand(b.key, { desi: e.target.value })} />
              <input style={s.input} inputMode="decimal" aria-label="Ücret (TL)" value={b.price} onChange={(e) => setBand(b.key, { price: e.target.value })} />
              <button type="button" style={s.linkBtn} onClick={() => setBands((x) => x.filter((y) => y.key !== b.key))}>
                Sil
              </button>
            </div>
          ))}
        </div>
        <button type="button" style={s.secondaryBtn} onClick={() => setBands((b) => [...b, { key: nextKey++, desi: "", price: "" }])}>
          Tarife satırı ekle
        </button>
        <label style={s.field}>
          <span style={s.label}>Son satırın üstündeki her ilave desi (TL)</span>
          <input style={s.input} inputMode="decimal" placeholder="Girilmedi" value={extra} onChange={(e) => setExtra(e.target.value)} />
          <span style={s.hint}>Boşsa son satırdan büyük koli fiyatlanmaz (sipariş telefonla alınır).</span>
        </label>
      </section>

      {/* 2) Koliler */}
      <section style={s.section}>
        <h3 style={s.h3}>2. Koliler</h3>
        <p style={s.hint}>
          Siparişleri gönderdiğiniz koliler (dış ölçü). Sistem sepeti sığdığı en küçük koliye koyar, dolunca yeni koli açar.
        </p>
        <div style={s.scroll}>
          <div style={s.table}>
            <div style={{ ...s.boxRow, ...s.th }}>
              <span>Ad</span>
              <span>En cm</span>
              <span>Boy cm</span>
              <span>Yük. cm</span>
              <span>En çok kg</span>
              <span>Koli+dolgu g</span>
              <span />
            </div>
            {boxes.map((b, i) => (
              <div key={b.id} style={s.boxRow}>
                <input style={s.input} aria-label="Koli adı" value={b.name} onChange={(e) => setBox(i, { name: e.target.value })} />
                <input style={s.input} inputMode="decimal" aria-label="En (cm)" value={b.l} onChange={(e) => setBox(i, { l: e.target.value })} />
                <input style={s.input} inputMode="decimal" aria-label="Boy (cm)" value={b.w} onChange={(e) => setBox(i, { w: e.target.value })} />
                <input style={s.input} inputMode="decimal" aria-label="Yükseklik (cm)" value={b.h} onChange={(e) => setBox(i, { h: e.target.value })} />
                <input style={s.input} inputMode="decimal" aria-label="En çok taşıyabileceği (kg)" value={b.maxKg} onChange={(e) => setBox(i, { maxKg: e.target.value })} />
                <input style={s.input} inputMode="numeric" aria-label="Boş koli ve dolgu ağırlığı (g)" value={b.tareG} onChange={(e) => setBox(i, { tareG: e.target.value })} />
                <button type="button" style={s.linkBtn} onClick={() => setBoxes((x) => x.filter((_, j) => j !== i))}>
                  Sil
                </button>
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          style={s.secondaryBtn}
          onClick={() =>
            setBoxes((b) => [...b, { id: `koli-${Date.now().toString(36)}`, name: "", l: "", w: "", h: "", maxKg: "", tareG: "" }])
          }
        >
          Koli ekle
        </button>
      </section>

      {/* 3) Ürün paket ölçüleri */}
      <section style={s.section}>
        <h3 style={s.h3}>3. Ürün paket ölçüleri</h3>
        <p style={s.hint}>
          Her ürünü kabıyla birlikte tartın (brüt g) ve dış ölçüsünü alın. Aynı kavanozu/şişeyi kullanan ürünler tek satırdır.
          Boş satır = ölçülmedi. “Cam” işaretli ürünlere kolide dolgu payı ayrılır.
        </p>
        <div style={s.scroll}>
          <div style={s.table}>
            <div style={{ ...s.measureRow, ...s.th }}>
              <span>Paket</span>
              <span>Brüt g</span>
              <span>En cm</span>
              <span>Boy cm</span>
              <span>Yük. cm</span>
              <span>Cam</span>
            </div>
            {PACKAGING_TYPES.map((t) => {
              const m = measures[t.id];
              return (
                <div key={t.id} style={s.measureRow}>
                  <span style={s.typeLabel}>
                    {t.label}
                    {t.skus.length > 1 && <span style={s.hint}> ({t.skus.length} ürün)</span>}
                  </span>
                  <input style={s.input} inputMode="numeric" aria-label={`${t.label} brüt ağırlık (g)`} value={m.g} onChange={(e) => setMeasure(t.id, { g: e.target.value })} />
                  <input style={s.input} inputMode="decimal" aria-label={`${t.label} en (cm)`} value={m.l} onChange={(e) => setMeasure(t.id, { l: e.target.value })} />
                  <input style={s.input} inputMode="decimal" aria-label={`${t.label} boy (cm)`} value={m.w} onChange={(e) => setMeasure(t.id, { w: e.target.value })} />
                  <input style={s.input} inputMode="decimal" aria-label={`${t.label} yükseklik (cm)`} value={m.h} onChange={(e) => setMeasure(t.id, { h: e.target.value })} />
                  <input type="checkbox" aria-label={`${t.label} cam / kırılabilir`} checked={m.fragile} onChange={(e) => setMeasure(t.id, { fragile: e.target.checked })} />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div style={s.footer}>
        <button type="button" style={s.primaryBtn} onClick={save} disabled={saving}>
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </button>
        {status && (
          <span role="status" style={{ color: status.kind === "ok" ? "#9fd39f" : "#f3a0a0", fontSize: "0.875rem" }}>
            {status.text}
          </span>
        )}
      </div>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{ fontSize: "0.8125rem", color: ok ? "#9fd39f" : "#e8c07a" }}>
      {ok ? "✓" : "○"} {label}
    </span>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: "1.25rem" },
  intro: { margin: 0, fontSize: "0.8125rem", color: "rgba(232,228,217,0.7)", lineHeight: 1.6 },
  readiness: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
    padding: "0.75rem 1rem",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
  },
  section: { display: "flex", flexDirection: "column", gap: "0.625rem" },
  checkRow: { display: "flex", gap: "0.625rem", alignItems: "flex-start", fontSize: "0.8125rem", color: "#e8e4d9" },
  h3: { margin: 0, fontSize: "0.9375rem", color: "#e8e4d9" },
  field: { display: "flex", flexDirection: "column", gap: "0.375rem", maxWidth: 300 },
  label: { fontSize: "0.8125rem", color: "rgba(232,228,217,0.7)" },
  hint: { fontSize: "0.75rem", color: "rgba(232,228,217,0.45)", margin: 0 },
  input: {
    padding: "0.5rem 0.625rem",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    color: "#e8e4d9",
    fontSize: "0.875rem",
    minWidth: 0,
    width: "100%",
    boxSizing: "border-box",
  },
  scroll: { overflowX: "auto" },
  table: { display: "flex", flexDirection: "column", gap: "0.5rem" },
  bandRow: { display: "grid", gridTemplateColumns: "140px 140px 50px", gap: "0.75rem", alignItems: "center" },
  boxRow: { display: "grid", gridTemplateColumns: "1.4fr repeat(5, 80px) 40px", gap: "0.5rem", alignItems: "center", minWidth: 640 },
  measureRow: { display: "grid", gridTemplateColumns: "2fr repeat(4, 72px) 40px", gap: "0.5rem", alignItems: "center", minWidth: 620 },
  typeLabel: { fontSize: "0.8125rem", color: "#e8e4d9" },
  th: { fontSize: "0.7rem", color: "rgba(232,228,217,0.5)", textTransform: "uppercase", letterSpacing: "0.04em" },
  footer: { display: "flex", alignItems: "center", gap: "1rem" },
  primaryBtn: {
    padding: "0.625rem 1.25rem",
    background: "#c4d68e",
    color: "#15180f",
    border: 0,
    borderRadius: 8,
    fontWeight: 600,
    fontSize: "0.875rem",
  },
  secondaryBtn: {
    alignSelf: "flex-start",
    padding: "0.5rem 0.875rem",
    background: "rgba(143,163,78,0.15)",
    border: "1px solid rgba(143,163,78,0.3)",
    borderRadius: 6,
    color: "#c4d68e",
    fontSize: "0.8125rem",
    whiteSpace: "nowrap",
  },
  linkBtn: { background: "none", border: 0, color: "#f3a0a0", fontSize: "0.8125rem", padding: 0 },
};
