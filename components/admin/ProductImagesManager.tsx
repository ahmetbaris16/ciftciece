"use client";

/**
 * Admin — ürün fotoğrafları: yükle (birden çok), kapak yap, açıklama (alt metin), kaldır.
 * Fotoğraf yüklemeden önce tarayıcıda küçültülür (productImageUpload.ts).
 */

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import styles from "./ProductImagesManager.module.css";
import { IMAGE_ACCEPT, uploadProductImage } from "./productImageUpload";

export interface AdminProductImage {
  id: string;
  url: string;
  altText: string | null;
}

export default function ProductImagesManager({
  productId,
  productName,
  images,
}: {
  productId: string;
  productName: string;
  images: AdminProductImage[];
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = async (url: string, init: RequestInit): Promise<boolean> => {
    const res = await fetch(url, init);
    if (res.ok) return true;
    const data = await res.json().catch(() => null);
    setError(data?.error ?? "İşlem yapılamadı.");
    return false;
  };

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy("upload");
    setError(null);
    const list = Array.from(files);
    let done = 0;
    try {
      for (const file of list) {
        const failure = await uploadProductImage(productId, file, productName, (stage) =>
          setStatus(`${done + 1} / ${list.length} ${stage === "prepare" ? "hazırlanıyor" : "yükleniyor"}…`)
        );
        if (failure) {
          setError(failure);
          break;
        }
        done++;
      }
    } catch {
      setError("Bağlantı hatası. Tekrar deneyin.");
    } finally {
      setStatus(done > 0 ? `${done} fotoğraf eklendi.` : null);
      setBusy(null);
      if (input.current) input.current.value = "";
      if (done > 0) router.refresh();
    }
  };

  const patch = async (imageId: string, body: Record<string, unknown>) => {
    setBusy(imageId);
    setError(null);
    try {
      if (
        await call(`/api/admin/products/${productId}/images/${imageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      ) {
        router.refresh();
      }
    } catch {
      setError("Bağlantı hatası. Tekrar deneyin.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (imageId: string) => {
    if (!window.confirm("Bu fotoğraf üründen kaldırılsın mı?")) return;
    setBusy(imageId);
    setError(null);
    try {
      if (
        await call(`/api/admin/products/${productId}/images/${imageId}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ) {
        router.refresh();
      }
    } catch {
      setError("Bağlantı hatası. Tekrar deneyin.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={styles.wrap} aria-labelledby="product-images-title">
      <div className={styles.head}>
        <h2 id="product-images-title" className={styles.title}>
          Fotoğraflar
        </h2>
        <button type="button" className={styles.upload} onClick={() => input.current?.click()} disabled={busy !== null}>
          {busy === "upload" ? "Yükleniyor…" : "Fotoğraf ekle"}
        </button>
        <input
          ref={input}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          hidden
          onChange={(e) => void upload(e.target.files)}
        />
      </div>
      <p className={styles.hint}>
        İlk fotoğraf ürün kartında ve ürün sayfasında kapak olarak görünür. Fotoğraflar yüklenmeden önce otomatik küçültülür.
      </p>
      {status && <p className={styles.status}>{status}</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {images.length === 0 ? (
        <p className={styles.empty}>Bu üründe fotoğraf yok; mağazada “Fotoğraf yakında” görünür.</p>
      ) : (
        <ul className={styles.grid}>
          {images.map((img, i) => (
            <li key={img.id} className={styles.item}>
              <div className={styles.thumb}>
                <Image src={img.url} alt={img.altText ?? productName} fill sizes="200px" style={{ objectFit: "cover" }} />
                {i === 0 && <span className={styles.cover}>Kapak</span>}
              </div>
              <input
                className={styles.alt}
                defaultValue={img.altText ?? ""}
                placeholder="Açıklama (ör. 1 kg Gemlik zeytin)"
                aria-label="Fotoğraf açıklaması"
                maxLength={500}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (img.altText ?? "")) void patch(img.id, { altText: v || null });
                }}
              />
              <div className={styles.actions}>
                {i > 0 && (
                  <button type="button" onClick={() => void patch(img.id, { makePrimary: true })} disabled={busy !== null}>
                    Kapak yap
                  </button>
                )}
                <button type="button" className={styles.danger} onClick={() => void remove(img.id)} disabled={busy !== null}>
                  Kaldır
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
