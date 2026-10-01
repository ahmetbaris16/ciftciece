"use client";

/**
 * Admin — Ürün Düzenleme Formu
 *
 * Ürün bilgilerini günceller, varyantları yönetir.
 */

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Product, Category } from "@/types";
import { formatPriceRaw } from "@/types";
import { decimalToKurus } from "@/lib/payment/money";
import { VAT_RATE_CHOICES, vatBpsToPercent, vatPercentToBps } from "@/lib/catalog/vat";

interface Props {
  product: Product;
  categories: Category[];
}

export default function ProductEditForm({ product, categories }: Props) {
  const router = useRouter();
  const [name, setName] = useState(product.name);
  const [slug, setSlug] = useState(product.slug);
  const [description, setDescription] = useState(product.description ?? "");
  const [categoryId, setCategoryId] = useState(product.categoryId);
  const [isPublished, setIsPublished] = useState(product.isPublished);
  const [isFeatured, setIsFeatured] = useState(product.isFeatured);
  // KDV oranı (%); "" = girilmemiş (siparişe boş kopyalanır)
  const [vatPercent, setVatPercent] = useState(vatBpsToPercent(product.vatRateBps));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Varyant state. initialStock: sayfa açıldığında görülen stok — stok yalnız admin değiştirdiyse ve
  // veritabanındaki değer hâlâ buysa yazılır (bu arada satış olduysa sunucu 409 döner; R-06)
  const [variants, setVariants] = useState(
    product.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku ?? "",
      priceKurus: v.priceKurus,
      stockQuantity: v.stockQuantity ?? 0,
      initialStock: v.stockQuantity ?? 0,
      isAvailable: v.isAvailable,
    }))
  );

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      // 1. Ürün bilgilerini güncelle
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, slug, description: description || null,
          categoryId, isPublished, isFeatured,
          vatRateBps: vatPercentToBps(vatPercent),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setMessage(`Hata: ${data.error}`);
        setSaving(false);
        return;
      }

      // 2. Varyant güncellemeleri — her yanıt kontrol edilir; biri bile yazılmadıysa "kaydedildi" denmez
      const failures: string[] = [];
      const savedStock = new Map<string, number>();
      for (const v of variants) {
        const stockChanged = v.stockQuantity !== v.initialStock;
        const r = await fetch(`/api/admin/products/${product.id}/variants`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            variantId: v.id,
            name: v.name,
            sku: v.sku || null,
            priceKurus: v.priceKurus,
            isAvailable: v.isAvailable,
            ...(stockChanged ? { stockQuantity: v.stockQuantity, expectedStock: v.initialStock } : {}),
          }),
        });
        if (r.ok) {
          savedStock.set(v.id, v.stockQuantity);
        } else {
          const data = await r.json().catch(() => ({}));
          failures.push(`${v.name}: ${data.error ?? `kaydedilemedi (HTTP ${r.status})`}`);
        }
      }

      // Kaydedilen stok yeni başlangıç değeri olur (sonraki kayıt onunla karşılaştırılır)
      setVariants((prev) => prev.map((v) => (savedStock.has(v.id) ? { ...v, initialStock: savedStock.get(v.id)! } : v)));
      setMessage(
        failures.length === 0
          ? "✓ Kaydedildi"
          : `Hata: ürün bilgileri kaydedildi ama ${failures.length} varyant kaydedilemedi — ${failures.join(" · ")}`
      );
      router.refresh();
    } catch {
      setMessage("Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  }

  function updateVariant(index: number, field: string, value: unknown) {
    setVariants((prev) => prev.map((v, i) => i === index ? { ...v, [field]: value } : v));
  }

  return (
    <form onSubmit={handleSave}>
      {message && (
        <div style={{
          padding: "0.75rem 1rem",
          borderRadius: "8px",
          marginBottom: "1rem",
          fontSize: "0.875rem",
          background: message.startsWith("✓") ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
          color: message.startsWith("✓") ? "#4ade80" : "#fca5a5",
        }}>
          {message}
        </div>
      )}

      {/* Ürün bilgileri */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Ürün Bilgileri</h2>

        <div style={styles.grid2}>
          <div style={styles.field}>
            <label style={styles.label}>Ürün Adı</label>
            <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Slug (URL)</label>
            <input style={styles.input} value={slug} onChange={(e) => setSlug(e.target.value)} required />
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Açıklama</label>
          <textarea style={{ ...styles.input, minHeight: "80px", resize: "vertical" as const }} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div style={styles.grid2}>
          <div style={styles.field}>
            <label style={styles.label}>Kategori</label>
            <select style={styles.input} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <label style={styles.label}>KDV oranı</label>
            <select style={styles.input} value={vatPercent} onChange={(e) => setVatPercent(e.target.value)}>
              <option value="">Girilmemiş</option>
              {VAT_RATE_CHOICES.map((r) => (
                <option key={r} value={String(r)}>%{r}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", paddingTop: "1.5rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", color: "rgba(232,228,217,0.7)", cursor: "pointer" }}>
              <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
              Yayında
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", color: "rgba(232,228,217,0.7)", cursor: "pointer" }}>
              <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
              Öne Çıkan
            </label>
          </div>
        </div>
      </div>

      {/* Varyantlar */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Varyantlar</h2>

        {variants.map((v, i) => (
          <div key={v.id} style={styles.variantRow}>
            <div style={styles.grid4}>
              <div style={styles.field}>
                <label style={styles.labelSmall}>Varyant Adı</label>
                <input style={styles.input} value={v.name} onChange={(e) => updateVariant(i, "name", e.target.value)} />
              </div>
              <div style={styles.field}>
                <label style={styles.labelSmall}>Fiyat (₺)</label>
                {/* Kuruş tam sayı: en fazla 2 ondalık; geçersiz giriş (ör. 3 ondalık) önceki değeri korur (F-01) */}
                <input style={styles.input} type="number" step="0.01" min="0" value={formatPriceRaw(v.priceKurus)}
                  onChange={(e) => updateVariant(i, "priceKurus", decimalToKurus(e.target.value || "0") ?? v.priceKurus)} />
              </div>
              <div style={styles.field}>
                <label style={styles.labelSmall}>Stok</label>
                <input style={styles.input} type="number" value={v.stockQuantity}
                  onChange={(e) => updateVariant(i, "stockQuantity", parseInt(e.target.value || "0"))} />
              </div>
              <div style={styles.field}>
                <label style={styles.labelSmall}>SKU</label>
                <input style={styles.input} value={v.sku} onChange={(e) => updateVariant(i, "sku", e.target.value)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button type="submit" disabled={saving} style={{
        padding: "0.75rem 2rem",
        background: saving ? "rgba(143,163,78,0.3)" : "linear-gradient(135deg, #6b7a3d 0%, #8fa34e 100%)",
        border: "none", borderRadius: "8px", color: "#fff",
        fontSize: "0.9375rem", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
        marginTop: "1rem",
      }}>
        {saving ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
      </button>
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: { marginBottom: "2rem", padding: "1.5rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px" },
  sectionTitle: { fontSize: "1rem", fontWeight: 600, color: "#e8e4d9", margin: "0 0 1rem" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" },
  grid4: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.75rem" },
  field: { display: "flex", flexDirection: "column" as const, gap: "0.375rem", marginBottom: "0.75rem" },
  label: { fontSize: "0.8125rem", fontWeight: 500, color: "rgba(232,228,217,0.7)" },
  labelSmall: { fontSize: "0.75rem", fontWeight: 500, color: "rgba(232,228,217,0.5)" },
  input: { padding: "0.625rem 0.875rem", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#e8e4d9", fontSize: "0.875rem", outline: "none" },
  variantRow: { padding: "1rem", background: "rgba(255,255,255,0.02)", borderRadius: "8px", marginBottom: "0.75rem", border: "1px solid rgba(255,255,255,0.04)" },
};
