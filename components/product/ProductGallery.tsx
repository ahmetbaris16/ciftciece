"use client";

/**
 * Ürün fotoğrafları — fotoğraf kırpılmadan, kendi oranıyla (çoğu 3:4) beyaz zeminde gösterilir.
 *
 * - Fare: fotoğrafın üzerine gelince 2,5 kat büyür; büyüme farenin olduğu noktaya doğrudur ve fareyi izler.
 * - Dokunmatik: dokununca dokunulan noktaya yakınlaşır, parmakla sürükleyerek gezilir, yeniden dokununca küçülür.
 * - Yakınlaşınca fotoğrafın yüksek çözünürlüklü kopyası (bir kez) yüklenir; sayfa açılışı hafif kalır.
 * - Birden çok fotoğrafta küçük resimler: tıklayınca ana fotoğraf değişir.
 * Konum her harekette React durumuna değil, CSS değişkenine yazılır (yeniden çizim yok).
 */

import Image from "next/image";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import styles from "./ProductGallery.module.css";

export interface GalleryImage {
  id: string;
  url: string;
  altText?: string | null;
}

const SCALE = 2.5;
/** Bu kadar pikselden az kayan dokunuş "dokunma" sayılır (sürükleme değil) */
const TAP_SLOP = 8;

type Zoom = "off" | "hover" | "touch";

const clamp = (v: number) => Math.min(100, Math.max(0, v));

export default function ProductGallery({ images, productName }: { images: GalleryImage[]; productName: string }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<Zoom>("off");
  // Yüksek çözünürlüklü kopyası istenen / yüklenen fotoğraflar
  const [hiResWanted, setHiResWanted] = useState<string[]>([]);
  const [hiResLoaded, setHiResLoaded] = useState<string[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const origin = useRef({ x: 50, y: 50 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);

  const image = images[Math.min(index, images.length - 1)];

  if (!image) {
    return (
      <div className={styles.stage} data-empty="true">
        <span className={styles.placeholder}>Fotoğraf yakında</span>
      </div>
    );
  }

  const setOrigin = (x: number, y: number) => {
    origin.current = { x: clamp(x), y: clamp(y) };
    stageRef.current?.style.setProperty("--zx", `${origin.current.x}%`);
    stageRef.current?.style.setProperty("--zy", `${origin.current.y}%`);
  };

  /** İmlecin / parmağın fotoğraf üzerindeki yeri (yüzde) */
  const pointAt = (e: ReactPointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };

  const wantHiRes = () => {
    if (!hiResWanted.includes(image.id)) setHiResWanted((w) => [...w, image.id]);
  };

  const onPointerEnter = (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const p = pointAt(e);
    setOrigin(p.x, p.y);
    wantHiRes();
    setZoom("hover");
  };

  const onPointerLeave = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse") setZoom("off");
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse") return;
    drag.current = { x: e.clientX, y: e.clientY, ox: origin.current.x, oy: origin.current.y, moved: false };
    if (zoom === "touch") {
      try {
        // Parmak fotoğrafın dışına kaysa da sürükleme sürsün
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // yakalama desteklenmiyorsa sürükleme yine fotoğraf üzerinde çalışır
      }
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse") {
      if (zoom !== "hover") {
        wantHiRes();
        setZoom("hover");
      }
      const p = pointAt(e);
      setOrigin(p.x, p.y);
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) d.moved = true;
    if (zoom !== "touch") return;
    // Sürükleme: fotoğraf parmakla birlikte kayar (büyütme merkezi ters yönde, 1/(ölçek-1) oranında)
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin(d.ox - ((dx / r.width) * 100) / (SCALE - 1), d.oy - ((dy / r.height) * 100) / (SCALE - 1));
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse") return;
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    // Dokunma: kapalıysa dokunulan noktaya yakınlaş, açıksa küçült
    if (zoom === "touch") {
      setZoom("off");
    } else {
      const p = pointAt(e);
      setOrigin(p.x, p.y);
      wantHiRes();
      setZoom("touch");
    }
  };

  const select = (i: number) => {
    setIndex(i);
    setZoom("off");
    setOrigin(50, 50);
  };

  const alt = image.altText ?? productName;
  const showHiRes = hiResWanted.includes(image.id);

  return (
    <div className={styles.gallery}>
      <div
        ref={stageRef}
        className={styles.stage}
        data-zoom={zoom}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <Image
          key={image.id}
          src={image.url}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          quality={85}
          loading="eager"
          fetchPriority="high"
          className={styles.layer}
          draggable={false}
        />
        {showHiRes && (
          <Image
            key={`${image.id}-hi`}
            src={image.url}
            alt=""
            aria-hidden="true"
            fill
            sizes="(max-width: 768px) 250vw, 1800px"
            quality={85}
            className={`${styles.layer} ${styles.hiRes}`}
            data-loaded={hiResLoaded.includes(image.id) ? "true" : undefined}
            onLoad={() => setHiResLoaded((l) => (l.includes(image.id) ? l : [...l, image.id]))}
            draggable={false}
          />
        )}
      </div>

      <p className={styles.hint} aria-hidden="true">
        <span className={styles.hintMouse}>Yakınlaştırmak için fotoğrafın üzerine gelin</span>
        <span className={styles.hintTouch}>{zoom === "touch" ? "Sürükleyerek gezinin, küçültmek için dokunun" : "Yakınlaştırmak için dokunun"}</span>
      </p>

      {images.length > 1 && (
        <div className={styles.thumbs} role="group" aria-label="Ürün fotoğrafları">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              className={styles.thumb}
              aria-label={`Fotoğraf ${i + 1}`}
              aria-pressed={i === index}
              onClick={() => select(i)}
            >
              <Image src={img.url} alt="" fill sizes="80px" quality={75} className={styles.thumbImg} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
