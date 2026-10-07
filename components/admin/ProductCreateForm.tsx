"use client";

/**
 * Admin — Yeni Ürün Oluşturma Formu
 *
 * Fotoğraflar ürünü kaydetmeden önce seçilebilir: seçilince tarayıcıda küçültülür ve önizlenir, ürün
 * oluşturulunca sırayla yüklenir (ilk fotoğraf kapak). Biri yüklenemezse ürün yine oluşur; düzenleme
 * sayfası kaç fotoğrafın eksik kaldığını yazar.
 */

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Category } from "@/types";
import { parseTlInput } from "@/lib/payment/money";
import { VAT_INPUT_RULE, parseVatPercent } from "@/lib/catalog/vat";
import { STOCK_INPUT_RULE, parseStockInput } from "@/lib/catalog/stock-input";
import VatRateField from "./VatRateField";
import imgStyles from "./ProductImagesManager.module.css";
import {
  IMAGE_ACCEPT,
  MAX_PRODUCT_IMAGES,
  postProductImage,
  prepareProductImage,
  type PreparedImage,
} from "./productImageUpload";

interface Props {
  categories: Category[];
}

interface VariantInput {
  name: string;
  /** Yazıldığı gibi ("289,90", "1.250"); kuruşa kaydederken çevrilir */
  priceTL: string;
  /** Yazıldığı gibi; boş = 0 (alan silinip istenen sayı yazılabilsin diye metin tutulur) */
  stockText: string;
}

interface PendingPhoto extends PreparedImage {
  key: string;
  previewUrl: string;
}

export default function ProductCreateForm({ categories }: Props) {
  // Yalnız sitede görünen kategoriler: gizli kategorideki ürünün kategori sayfası ve menü bağlantısı olmaz
  const categoryOptions = categories.filter((c) => c.isPublished);
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(categoryOptions[0]?.id ?? "");
  const [isPublished, setIsPublished] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  // KDV oranı (%); "" = girilmemiş
  const [vatPercent, setVatPercent] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [variants, setVariants] = useState<VariantInput[]>([
    { name: "", priceTL: "", stockText: "" },
  ]);

  const photoInput = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  // Önizleme adresleri sayfadan çıkınca bırakılır
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []);

  async function pickPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setPhotoBusy(true);
    setPhotoError(null);
    const errors: string[] = [];
    const added: PendingPhoto[] = [];
    const seen = new Set(photos.map((p) => p.key));
    let room = MAX_PRODUCT_IMAGES - photos.length;
    try {
      for (const file of Array.from(files)) {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (seen.has(key)) continue;
        if (room <= 0) {
          errors.push(`Bir üründe en fazla ${MAX_PRODUCT_IMAGES} fotoğraf olabilir.`);
          break;
        }
        const prepared = await prepareProductImage(file);
        if (typeof prepared === "string") {
          errors.push(prepared);
          continue;
        }
        seen.add(key);
        room--;
        added.push({ ...prepared, key, previewUrl: URL.createObjectURL(prepared.blob) });
      }
    } finally {
      setPhotos((prev) => [...prev, ...added]);
      setPhotoError(errors.length > 0 ? errors.join(" ") : null);
      setPhotoBusy(false);
      if (photoInput.current) photoInput.current.value = "";
    }
  }

  function removePhoto(key: string) {
    const gone = photos.find((p) => p.key === key);
    if (gone) URL.revokeObjectURL(gone.previewUrl);
    setPhotos((prev) => prev.filter((p) => p.key !== key));
  }

  function makeCover(key: string) {
    setPhotos((prev) => [...prev.filter((p) => p.key === key), ...prev.filter((p) => p.key !== key)]);
  }

  function addVariant() {
    setVariants((prev) => [...prev, { name: "", priceTL: "", stockText: "" }]);
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
    setMessage("");
    const vat = parseVatPercent(vatPercent);
    if (!vat.ok) {
      setMessage(`Hata: KDV oranı geçersiz — ${VAT_INPUT_RULE}`);
      return;
    }

    // TL → kuruş tam sayı aritmetiğiyle (F-01): en fazla 2 ondalık; aşan giriş sessizce yuvarlanmaz.
    // Boş fiyat artık 0 TL diye kaydedilmez (fiyatı unutulan ürün bedava görünürdü)
    const named = variants.filter((v) => v.name.trim());
    const badPrice = named.find((v) => parseTlInput(v.priceTL) === null);
    if (badPrice) {
      setMessage(
        badPrice.priceTL.trim() === ""
          ? `Hata: "${badPrice.name}" için fiyat yazın (ör. 289,90)`
          : `Hata: "${badPrice.name}" fiyatı geçersiz — en fazla 2 ondalık basamak (ör. 289,90)`
      );
      return;
    }
    const badStock = named.find((v) => parseStockInput(v.stockText) === null);
    if (badStock) {
      setMessage(`Hata: "${badStock.name}" stoğu geçersiz — ${STOCK_INPUT_RULE}`);
      return;
    }
    const apiVariants = named.map((v, i) => ({
      name: v.name,
      priceKurus: parseTlInput(v.priceTL)!,
      isAvailable: true,
      sortOrder: i,
      stockQuantity: parseStockInput(v.stockText)!,
    }));

    if (apiVariants.length === 0) {
      setMessage("En az 1 varyant ekleyin");
      return;
    }
    setSaving(true);

    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, description: description || undefined,
          categoryId, isPublished, isFeatured, sortOrder: 0,
          vatRateBps: vat.bps,
          variants: apiVariants,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage(`Hata: ${data.error}`);
        setSaving(false);
        return;
      }

      // Seçilen fotoğraflar sırayla yüklenir (ilk = kapak). Ürün oluştu: hata olsa da form yeniden
      // gönderilmez (ikinci ürün açılırdı), düzenleme sayfası eksik kalanı söyler
      const createdId = (data as { product?: { id?: string } }).product?.id;
      if (!createdId) {
        router.push("/admin/urunler");
        router.refresh();
        return;
      }
      let uploaded = 0;
      for (const [i, photo] of photos.entries()) {
        setProgress(`Fotoğraf ${i + 1} / ${photos.length} yükleniyor…`);
        const failure = await postProductImage(createdId, photo, name.trim()).catch(() => "bağlantı hatası");
        if (failure === null) uploaded++;
      }
      const missing = photos.length - uploaded;
      const query = photos.length > 0 ? `&foto=${uploaded}${missing > 0 ? `&eksik=${missing}` : ""}` : "";
      router.push(`/admin/urunler/${createdId}?yeni=1${query}`);
      router.refresh();
    } catch {
      setMessage("Bir hata oluştu");
      setSaving(false);
      setProgress(null);
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
        <h2 style={{ ...styles.sectionTitle, marginBottom: "1rem" }}>Ürün Bilgileri</h2>
        <div style={styles.field}>
          <label style={styles.label}>Ürün Adı *</label>
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} required placeholder="Naturel Sızma Zeytinyağı" />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Açıklama</label>
          <textarea style={{ ...styles.input, minHeight: "80px", resize: "vertical" as const }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ürün açıklaması..." />
        </div>

        <div style={styles.grid2}>
          <div style={styles.field}>
            <label htmlFor="product-category" style={styles.label}>Kategori *</label>
            <select id="product-category" style={styles.input} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", paddingTop: "1.5rem" }}>
            <label style={styles.checkbox}>
              <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} /> Yayında
            </label>
            <label style={styles.checkbox}>
              <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} /> Ana sayfada göster
            </label>
          </div>
        </div>

        <VatRateField value={vatPercent} onChange={setVatPercent} />
      </div>

      <section className={imgStyles.wrap} aria-labelledby="new-product-photos">
        <div className={imgStyles.head}>
          <h2 id="new-product-photos" className={imgStyles.title}>
            Fotoğraflar
          </h2>
          <button
            type="button"
            className={imgStyles.upload}
            onClick={() => photoInput.current?.click()}
            disabled={photoBusy || saving || photos.length >= MAX_PRODUCT_IMAGES}
          >
            {photoBusy ? "Hazırlanıyor…" : "Fotoğraf seç"}
          </button>
          <input
            ref={photoInput}
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            hidden
            onChange={(e) => void pickPhotos(e.target.files)}
          />
        </div>
        <p className={imgStyles.hint}>
          İlk fotoğraf ürün kartında ve ürün sayfasında kapak olarak görünür. Fotoğraflar otomatik küçültülür ve
          “Ürün Oluştur”a basınca ürünle birlikte kaydedilir. Sonradan da eklenebilir.
        </p>
        {photoError && (
          <p className={imgStyles.error} role="alert">
            {photoError}
          </p>
        )}
        {photos.length > 0 && (
          <ul className={imgStyles.grid}>
            {photos.map((p, i) => (
              <li key={p.key} className={imgStyles.item}>
                <div className={imgStyles.thumb}>
                  <Image src={p.previewUrl} alt={`Seçilen fotoğraf ${i + 1}`} fill sizes="200px" style={{ objectFit: "cover" }} />
                  {i === 0 && <span className={imgStyles.cover}>Kapak</span>}
                </div>
                <div className={imgStyles.actions}>
                  {i > 0 && (
                    <button type="button" onClick={() => makeCover(p.key)} disabled={saving}>
                      Kapak yap
                    </button>
                  )}
                  <button type="button" className={imgStyles.danger} onClick={() => removePhoto(p.key)} disabled={saving}>
                    Çıkar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

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
                <label style={styles.labelSmall} htmlFor={`new-price-${i}`}>Fiyat (₺) *</label>
                {/* Metin alanı: "289,90" de yazılabilir (telefon klavyesinde ondalık virgül) */}
                <input id={`new-price-${i}`} style={{ ...styles.input, ...(v.priceTL.trim() && parseTlInput(v.priceTL) === null ? styles.invalid : {}) }}
                  inputMode="decimal" autoComplete="off" value={v.priceTL} placeholder="289,90"
                  aria-invalid={v.priceTL.trim() !== "" && parseTlInput(v.priceTL) === null}
                  onChange={(e) => updateVariant(i, "priceTL", e.target.value)} />
              </div>
              <div style={styles.field}>
                <label style={styles.labelSmall} htmlFor={`new-stock-${i}`}>Stok (adet)</label>
                {/* Boş bırakılırsa 0; alan silinip istenen sayı yazılır (eskiden "0" silinemiyordu) */}
                <input id={`new-stock-${i}`} style={{ ...styles.input, ...(parseStockInput(v.stockText) === null ? styles.invalid : {}) }}
                  inputMode="numeric" autoComplete="off" value={v.stockText} placeholder="0"
                  aria-invalid={parseStockInput(v.stockText) === null}
                  onChange={(e) => updateVariant(i, "stockText", e.target.value)} />
              </div>
              {variants.length > 1 && (
                <div style={{ display: "flex", alignItems: "flex-end", minWidth: 0 }}>
                  <button type="button" onClick={() => removeVariant(i)} style={styles.removeBtn} aria-label="Varyantı kaldır">✕</button>
                </div>
              )}
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
        {saving ? (progress ?? "Oluşturuluyor...") : "Ürün Oluştur"}
      </button>
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: { marginBottom: "2rem", padding: "1.5rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px" },
  sectionTitle: { fontSize: "1rem", fontWeight: 600, color: "#e8e4d9", margin: 0 },
  // Sütunlar dar ekranda alt alta iner; alanlar sütununa sığar (taşmasın: minWidth 0 + width 100%)
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))", gap: "1rem" },
  grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))", gap: "0.75rem" },
  field: { display: "flex", flexDirection: "column" as const, gap: "0.375rem", marginBottom: "0.75rem", minWidth: 0 },
  label: { fontSize: "0.8125rem", fontWeight: 500, color: "rgba(232,228,217,0.7)" },
  labelSmall: { fontSize: "0.75rem", fontWeight: 500, color: "rgba(232,228,217,0.5)" },
  input: { width: "100%", minWidth: 0, boxSizing: "border-box", padding: "0.625rem 0.875rem", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#e8e4d9", fontSize: "0.875rem" },
  checkbox: { display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", color: "rgba(232,228,217,0.7)", cursor: "pointer" },
  variantRow: { padding: "1rem", background: "rgba(255,255,255,0.02)", borderRadius: "8px", marginBottom: "0.75rem", border: "1px solid rgba(255,255,255,0.04)" },
  addBtn: { padding: "0.375rem 0.75rem", background: "rgba(143,163,78,0.15)", border: "1px solid rgba(143,163,78,0.3)", borderRadius: "6px", color: "#c4d68e", fontSize: "0.8125rem", cursor: "pointer" },
  removeBtn: { padding: "0.5rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "6px", color: "#fca5a5", fontSize: "0.75rem", cursor: "pointer", marginBottom: "0.75rem" },
  invalid: { borderColor: "rgba(239,68,68,0.8)" },
};
