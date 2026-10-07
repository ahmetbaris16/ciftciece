"use client";

/**
 * Ürün fotoğrafları — fotoğraf kırpılmadan, kendi oranıyla (çoğu 3:4) beyaz zeminde gösterilir.
 *
 * - Fare: fotoğrafın üzerine gelince 2,5 kat büyür; büyüme farenin olduğu noktaya doğrudur ve fareyi izler.
 *   Tıklayınca tam ekran görüntüleyici açılır.
 * - Dokunmatik (telefon/tablet): dokununca ya da iki parmakla büyütmeye çalışınca tam ekran görüntüleyici açılır
 *   (ProductLightbox: iki parmakla büyütme, çift dokunuş, kaydırarak fotoğraf değiştirme, geri tuşuyla kapanma).
 *   Eskiden fotoğraf küçük kutusunun içinde büyüyordu; telefonda iki parmakla büyütmek mümkün değildi.
 * - Köşedeki "Büyüt" düğmesi klavyeyle de açar.
 * - Yakınlaşınca fotoğrafın yüksek çözünürlüklü kopyası (bir kez) yüklenir; sayfa açılışı hafif kalır.
 * - Birden çok fotoğrafta küçük resimler: tıklayınca ana fotoğraf değişir.
 * Konum her harekette React durumuna değil, CSS değişkenine yazılır (yeniden çizim yok).
 */

import Image from "next/image";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import ProductLightbox from "./ProductLightbox";
import styles from "./ProductGallery.module.css";

export interface GalleryImage {
  id: string;
  url: string;
  altText?: string | null;
}

/** Bu kadar pikselden az kayan dokunuş "dokunma" sayılır (kaydırma değil) */
const TAP_SLOP = 8;

const clamp = (v: number) => Math.min(100, Math.max(0, v));

export default function ProductGallery({ images, productName }: { images: GalleryImage[]; productName: string }) {
  const [index, setIndex] = useState(0);
  const [hover, setHover] = useState(false);
  // Tam ekran görüntüleyici açıksa hangi fotoğrafla açıldığı
  const [viewer, setViewer] = useState<number | null>(null);
  // Yüksek çözünürlüklü kopyası istenen / yüklenen fotoğraflar
  const [hiResWanted, setHiResWanted] = useState<string[]>([]);
  const [hiResLoaded, setHiResLoaded] = useState<string[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const openBtnRef = useRef<HTMLButtonElement>(null);
  const touches = useRef(new Map<number, { x: number; y: number; moved: boolean }>());

  const image = images[Math.min(index, images.length - 1)];

  if (!image) {
    return (
      <div className={styles.stage} data-empty="true">
        <span className={styles.placeholder}>Fotoğraf yakında</span>
      </div>
    );
  }

  const setOrigin = (x: number, y: number) => {
    stageRef.current?.style.setProperty("--zx", `${clamp(x)}%`);
    stageRef.current?.style.setProperty("--zy", `${clamp(y)}%`);
  };

  /** İmlecin fotoğraf üzerindeki yeri (yüzde) */
  const pointAt = (e: ReactPointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };

  const wantHiRes = () => {
    if (!hiResWanted.includes(image.id)) setHiResWanted((w) => [...w, image.id]);
  };

  const openViewer = () => {
    setHover(false);
    touches.current.clear();
    setViewer(index);
  };

  const onPointerEnter = (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const p = pointAt(e);
    setOrigin(p.x, p.y);
    wantHiRes();
    setHover(true);
  };

  const onPointerLeave = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse") setHover(false);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse") return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: false });
    // İki parmakla büyütmeye çalışınca: görüntüleyici açılır (burada sayfa kaydırması için iki parmak kapalı)
    if (touches.current.size >= 2) openViewer();
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse") {
      if (!hover) {
        wantHiRes();
        setHover(true);
      }
      const p = pointAt(e);
      setOrigin(p.x, p.y);
      return;
    }
    const t = touches.current.get(e.pointerId);
    if (t && (Math.abs(e.clientX - t.x) > TAP_SLOP || Math.abs(e.clientY - t.y) > TAP_SLOP)) t.moved = true;
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse") {
      // Sol tıklama: tam ekran (sağ/orta tıklama değil)
      if (e.button === 0) openViewer();
      return;
    }
    const t = touches.current.get(e.pointerId);
    touches.current.delete(e.pointerId);
    // Dokunma (kaydırma değil): tam ekran görüntüleyici
    if (t && !t.moved) openViewer();
  };

  const select = (i: number) => {
    setIndex(i);
    setHover(false);
    setOrigin(50, 50);
  };

  const alt = image.altText ?? productName;
  const showHiRes = hiResWanted.includes(image.id);

  return (
    <div className={styles.gallery}>
      <div
        ref={stageRef}
        className={styles.stage}
        data-zoom={hover ? "hover" : "off"}
        data-testid="product-gallery-stage"
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => {
          touches.current.delete(e.pointerId);
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
        <button
          ref={openBtnRef}
          type="button"
          className={styles.expand}
          aria-label="Fotoğrafı tam ekran büyüt"
          // Düğmeye dokunmak/tıklamak sahnenin dokunma işleyicisine gitmesin (iki kez açılmasın)
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={openViewer}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
      </div>

      <p className={styles.hint} aria-hidden="true">
        <span className={styles.hintMouse}>Yakınlaştırmak için üzerine gelin, büyük görmek için tıklayın</span>
        <span className={styles.hintTouch}>Büyütmek için fotoğrafa dokunun</span>
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

      {viewer !== null && (
        <ProductLightbox
          images={images}
          productName={productName}
          startIndex={viewer}
          onClose={(last) => {
            setViewer(null);
            select(last);
            openBtnRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </div>
  );
}
