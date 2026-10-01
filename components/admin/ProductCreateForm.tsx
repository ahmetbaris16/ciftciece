"use client";

/**
 * Admin — Yeni Ürün Oluşturma Formu
 */

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Category } from "@/types";

interface Props {
  categories: Category[];
}

interface VariantInput {
  name: string;
  sku: string;
  priceTL: string;
  stockQuantity: number;
}

export default function ProductCreateForm({ categories }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [isPublished, setIsPublished] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [variants, setVariants] = useState<VariantInput[]>([
    { name: "", sku: "", priceTL: "", stockQuantity: 0 },
  ]);

  // İsimden otomatik slug üret
  function generateSlug(text: string) {
    return text
      .toLowerCase()
      .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
      .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slug || slug === generateSlug(name)) {
      setSlug(generateSlug(value));
    }
  }

  function addVariant() {
    setVariants((prev) => [...prev, { name: "", sku: "", priceTL: "", stockQuantity: 0 }]);
  }

  function removeVariant(index: number) {
    if (variants.length <= 1) return;
    setVariants((prev) => prev.filter((_, i) => i !== index));
  }

  function updateVariant(index: number, field: string, value: unknown) {
    setVariants((prev) => prev.map((v, i) => i === index ? { ...v, [field]: value } : v));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    const apiVariants = variants
      .filter((v) => v.name.trim())
      .map((v, i) => ({
        name: v.name,
        sku: v.sku || undefined,
        priceKurus: Math.round(parseFloat(v.priceTL || "0") * 100),
        isAvailable: true,
        sortOrder: i,
        stockQuantity: v.stockQuantity,
      }));

    if (apiVariants.length === 0) {
      setMessage("En az 1 varyant ekleyin");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, slug, description: description || undefined,
          categoryId, isPublished, isFeatured, sortOrder: 0,
          variants: apiVariants,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage(`Hata: ${data.error}`);
        setSaving(false);
        return;
      }

      router.push("/admin/urunler");
      router.refresh();
    } catch {
      setMessage("Bir hata oluştu");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {message && (
        <div style={{
          padding: "0.75rem 1rem", borderRadius: "8px", marginBottom: "1rem", fontSize: "0.875rem",
          background: "rgba(239,68,68,0.15)", color: "#fca5a5",
        }}>
          {message}
        </div>
      )}

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Ürün Bilgileri</h2>
        <div style={styles.grid2}>
          <div style={styles.field}>
            <label style={styles.label}>Ürün Adı *</label>
            <input style={styles.input} value={name} onChange={(e) => handleNameChange(e.target.value)} required placeholder="Naturel Sızma Zeytinyağı" />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Slug (URL) *</label>
            <input style={styles.input} value={slug} onChange={(e) => setSlug(e.target.value)} required placeholder="naturel-sizma-zeytinyagi" />
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Açıklama</label>
          <textarea style={{ ...styles.input, minHeight: "80px", resize: "vertical" as const }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ürün açıklaması..." />
        </div>

        <div style={styles.grid2}>
          <div style={styles.field}>
            <label style={styles.label}>Kategori *</label>
            <select style={styles.input} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", paddingTop: "1.5rem" }}>
            <label style={styles.checkbox}>
              <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} /> Yayında
            </label>
            <label style={styles.checkbox}>
              <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} /> Öne Çıkan
            </label>
          </div>
        </div>
      </div>

      <div style={styles.section}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={styles.sectionTitle}>Varyantlar</h2>
          <button type="button" onClick={addVariant} style={styles.addBtn}>+ Varyant Ekle</button>
        </div>

        {variants.map((v, i) => (
          <div key={i} style={styles.variantRow}>
            <div style={styles.grid4}>
              <div style={styles.field}>
                <label style={styles.labelSmall}>Ad *</label>
                <input style={styles.input} value={v.name} onChange={(e) => updateVariant(i, "name", e.target.value)} placeholder="500 ml" />
              </div>
              <div style={styles.field}>
                <label style={styles.labelSmall}>Fiyat (₺)</label>
                <input style={styles.input} type="number" step="0.01" value={v.priceTL} onChange={(e) => updateVariant(i, "priceTL", e.target.value)} placeholder="289.00" />
              </div>
              <div style={styles.field}>
                <label style={styles.labelSmall}>Stok</label>
                <input style={styles.input} type="number" value={v.stockQuantity} onChange={(e) => updateVariant(i, "stockQuantity", parseInt(e.target.value || "0"))} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem" }}>
                <div style={styles.field}>
                  <label style={styles.labelSmall}>SKU</label>
                  <input style={styles.input} value={v.sku} onChange={(e) => updateVariant(i, "sku", e.target.value)} />
                </div>
                {variants.length > 1 && (
                  <button type="button" onClick={() => removeVariant(i)} style={styles.removeBtn}>✕</button>
                )}
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
      }}>
        {saving ? "Oluşturuluyor..." : "Ürün Oluştur"}
      </button>
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: { marginBottom: "2rem", padding: "1.5rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px" },
  sectionTitle: { fontSize: "1rem", fontWeight: 600, color: "#e8e4d9", margin: 0 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" },
  grid4: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.75rem" },
  field: { display: "flex", flexDirection: "column" as const, gap: "0.375rem", marginBottom: "0.75rem" },
  label: { fontSize: "0.8125rem", fontWeight: 500, color: "rgba(232,228,217,0.7)" },
  labelSmall: { fontSize: "0.75rem", fontWeight: 500, color: "rgba(232,228,217,0.5)" },
  input: { padding: "0.625rem 0.875rem", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#e8e4d9", fontSize: "0.875rem", outline: "none" },
  checkbox: { display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", color: "rgba(232,228,217,0.7)", cursor: "pointer" },
  variantRow: { padding: "1rem", background: "rgba(255,255,255,0.02)", borderRadius: "8px", marginBottom: "0.75rem", border: "1px solid rgba(255,255,255,0.04)" },
  addBtn: { padding: "0.375rem 0.75rem", background: "rgba(143,163,78,0.15)", border: "1px solid rgba(143,163,78,0.3)", borderRadius: "6px", color: "#c4d68e", fontSize: "0.8125rem", cursor: "pointer" },
  removeBtn: { padding: "0.5rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "6px", color: "#fca5a5", fontSize: "0.75rem", cursor: "pointer", marginBottom: "0.75rem" },
};
