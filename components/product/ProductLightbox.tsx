"use client";

/**
 * Ürün fotoğrafı — tam ekran görüntüleyici (özellikle telefon için).
 *
 * - İki parmakla büyütme (en çok 4 kat), büyükken parmakla gezinme, çift dokunuşla yakınlaş / küçül.
 * - Büyük değilken sağa-sola kaydırınca önceki / sonraki fotoğraf; oklar ve ← → tuşları da çalışır.
 * - Kapat düğmesi, Esc ve telefonun / tarayıcının geri tuşu kapatır (açılınca geçmişe bir kayıt eklenir;
 *   sayfa değişmez, adres aynı kalır).
 * - Fare: tekerlekle büyütme, çift tıklama, sürükleme. Klavye: <dialog> odağı içeride tutar.
 * Büyütme konumu her harekette React durumuna değil, doğrudan stile yazılır (yeniden çizim yok).
 */

import Image from "next/image";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import styles from "./ProductLightbox.module.css";

export interface LightboxImage {
  id: string;
  url: string;
  altText?: string | null;
}

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 320;
/** Bu kadar pikselden az kayan dokunuş "dokunma" sayılır */
const TAP_SLOP = 10;
/** Fotoğraf değiştirmek için en az kaydırma */
const SWIPE_MIN = 50;
const HISTORY_MARK = "productLightbox";

type Gesture =
  | { kind: "pan"; px: number; py: number; x0: number; y0: number; moved: boolean }
  | { kind: "swipe"; px: number; py: number; moved: boolean }
  | { kind: "pinch"; d0: number; mx: number; my: number; s0: number; x0: number; y0: number };

export default function ProductLightbox({
  images,
  productName,
  startIndex,
  onClose,
}: {
  images: LightboxImage[];
  productName: string;
  startIndex: number;
  /** Kapanınca son bakılan fotoğrafın sırasıyla çağrılır */
  onClose: (index: number) => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // Görünüm: ölçek ve kaydırma (px, fotoğraf ortası ekran ortasındayken 0)
  const view = useRef({ s: 1, x: 0, y: 0 });
  // Fotoğrafın en/boy oranı (yüklenince gerçek değeri); ekrana sığan boyut bundan hesaplanır
  const ratio = useRef(3 / 4);
  const fit = useRef({ w: 0, h: 0, vw: 0, vh: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  // Bu dokunuşta iki parmak kullanıldı: parmaklar kalkarken "dokunma" sayılmaz
  const multiTouch = useRef(false);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const indexRef = useRef(index);
  const onCloseRef = useRef(onClose);
  // Kapanış bir kez: Esc'te tarayıcı hem "cancel" hem "close" olayı verebilir; geri iki kez çalışıp önceki sayfaya
  // dönülmesin
  const closing = useRef(false);
  useEffect(() => {
    indexRef.current = index;
    onCloseRef.current = onClose;
  });

  const image = images[index];
  const many = images.length > 1;

  /** Görünümü sınırla (fotoğraf ekrandan kaçmasın) ve stile yaz; yeni ölçeği döndürür */
  const setView = (next: { s: number; x: number; y: number }, animate = false) => {
    const { w, h, vw, vh } = fit.current;
    const s = Math.min(MAX_SCALE, Math.max(1, next.s));
    const maxX = Math.max(0, (s * w - vw) / 2);
    const maxY = Math.max(0, (s * h - vh) / 2);
    view.current = { s, x: Math.min(maxX, Math.max(-maxX, next.x)), y: Math.min(maxY, Math.max(-maxY, next.y)) };
    paint(animate);
    return s;
  };

  /** Dokunuş / tıklama sonucu: görünüm + "büyük mü" ipucu */
  const apply = (next: { s: number; x: number; y: number }, animate = false) => setZoomed(setView(next, animate) > 1.01);

  const paint = (animate: boolean, extraX = 0) => {
    const el = frameRef.current;
    if (!el) return;
    const { s, x, y } = view.current;
    el.dataset.animate = animate ? "true" : "false";
    el.style.transform = `translate3d(${x + extraX}px, ${y}px, 0) scale(${s})`;
  };

  /** Fotoğrafı ekrana sığdır (açılışta, fotoğraf yüklenince, ekran dönünce) */
  const layout = () => {
    const vp = viewportRef.current;
    const el = frameRef.current;
    if (!vp || !el) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const w = Math.min(vw, vh * ratio.current);
    const h = w / ratio.current;
    fit.current = { w, h, vw, vh };
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    setView(view.current);
  };

  const reset = (animate = false) => apply({ s: 1, x: 0, y: 0 }, animate);

  /** Ekrandaki bir noktayı (px, görüntü alanına göre) sabit tutarak ölçek değiştir */
  const zoomAt = (s: number, px: number, py: number, animate: boolean) => {
    const { vw, vh } = fit.current;
    const cx = px - vw / 2;
    const cy = py - vh / 2;
    const v = view.current;
    const qx = (cx - v.x) / v.s;
    const qy = (cy - v.y) / v.s;
    const ns = Math.min(MAX_SCALE, Math.max(1, s));
    apply({ s: ns, x: cx - ns * qx, y: cy - ns * qy }, animate);
  };

  const go = (delta: number) => {
    const next = index + delta;
    if (next < 0 || next >= images.length) {
      paint(true);
      return;
    }
    view.current = { s: 1, x: 0, y: 0 };
    setIndex(next);
    setZoomed(false);
  };

  // Kapatma: geçmişe eklenen kayıt geri alınır (geri tuşu da aynı yoldan kapatır)
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    if (window.history.state?.[HISTORY_MARK]) window.history.back();
    else onCloseRef.current(indexRef.current);
  };

  // Açılış: modal, sayfa kaydırması kilitli, geçmiş kaydı, ekran boyutu değişince yeniden sığdırma
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    // Geri tuşu sayfadan çıkmasın, görüntüleyiciyi kapatsın (adres aynı kalır; React geliştirme kipinde
    // etki iki kez çalışır: kayıt bir kez eklenir)
    if (!window.history.state?.[HISTORY_MARK]) window.history.pushState({ [HISTORY_MARK]: true }, "");
    const onPop = () => {
      if (window.history.state?.[HISTORY_MARK]) return;
      closing.current = true;
      onCloseRef.current(indexRef.current);
    };
    window.addEventListener("popstate", onPop);
    const onResize = () => layout();
    window.addEventListener("resize", onResize);
    layout();
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("resize", onResize);
      root.style.overflow = prevOverflow;
    };
    // layout yalnız ref'lerle çalışır; açılışta bir kez kurulur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fotoğraf değişince sığdır (oran yüklenince yeniden)
  useEffect(() => {
    layout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = viewportRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const startGesture = () => {
    const pts = [...pointers.current.values()];
    const v = view.current;
    if (pts.length >= 2) {
      multiTouch.current = true;
      const [a, b] = pts;
      gesture.current = {
        kind: "pinch",
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
        s0: v.s,
        x0: v.x,
        y0: v.y,
      };
    } else if (pts.length === 1) {
      const [p] = pts;
      gesture.current =
        v.s > 1.01
          ? { kind: "pan", px: p.x, py: p.y, x0: v.x, y0: v.y, moved: false }
          : { kind: "swipe", px: p.x, py: p.y, moved: false };
    } else {
      gesture.current = null;
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // yakalama desteklenmiyorsa hareket yine görüntü alanında izlenir
    }
    pointers.current.set(e.pointerId, local(e));
    startGesture();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const [a, b] = pts;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const { vw, vh } = fit.current;
      // Parmakların ortasındaki nokta parmaklarla birlikte kalır
      const qx = (g.mx - vw / 2 - g.x0) / g.s0;
      const qy = (g.my - vh / 2 - g.y0) / g.s0;
      const s = Math.min(MAX_SCALE, Math.max(1, (g.s0 * d) / g.d0));
      apply({ s, x: mx - vw / 2 - s * qx, y: my - vh / 2 - s * qy });
      return;
    }
    const dx = p.x - g.px;
    const dy = p.y - g.py;
    if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) g.moved = true;
    if (g.kind === "pan") {
      apply({ s: view.current.s, x: g.x0 + dx, y: g.y0 + dy });
    } else if (many && Math.abs(dx) > Math.abs(dy)) {
      // Kaydırma: fotoğraf parmağı izler (ilk/son fotoğrafta yarı yarıya)
      const edge = (dx > 0 && index === 0) || (dx < 0 && index === images.length - 1);
      paint(false, edge ? dx / 3 : dx);
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    const wasMulti = multiTouch.current;
    if (pointers.current.size === 0) multiTouch.current = false;
    if (g?.kind === "swipe") {
      const dx = p.x - g.px;
      const dy = p.y - g.py;
      if (many && g.moved && Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
        go(dx < 0 ? 1 : -1);
      } else {
        paint(true);
      }
    }
    if (g && g.kind !== "pinch" && !g.moved && !wasMulti) {
      // Çift dokunuş: büyükse küçült, değilse dokunulan noktaya yakınlaş
      const now = Date.now();
      const prev = lastTap.current;
      if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(p.x - prev.x, p.y - prev.y) < 30) {
        lastTap.current = null;
        if (view.current.s > 1.01) reset(true);
        else zoomAt(DOUBLE_TAP_SCALE, p.x, p.y, true);
      } else {
        lastTap.current = { t: now, x: p.x, y: p.y };
      }
    }
    // Parmaklardan biri kalktıysa kalanla devam (iki parmaktan bire: gezinme)
    startGesture();
  };

  const onPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) multiTouch.current = false;
    if (gesture.current?.kind === "swipe") paint(true);
    startGesture();
  };

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    const p = local(e);
    zoomAt(view.current.s * Math.exp(-e.deltaY * 0.0015), p.x, p.y, false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" && many) go(1);
    else if (e.key === "ArrowLeft" && many) go(-1);
  };

  if (!image) return null;
  const alt = image.altText ?? productName;

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-label={`${productName} — fotoğraf ${index + 1} / ${images.length}`}
      onCancel={(e) => {
        // Esc / Android geri hareketi: geçmiş kaydıyla birlikte kapat
        e.preventDefault();
        close();
      }}
      onClose={() => {
        // Tarayıcı pencereyi kendisi kapattıysa (ör. arka arkaya Esc) da kayıt geri alınır, sayfa kilidi açılır
        close();
      }}
      onKeyDown={onKeyDown}
    >
      <div className={styles.bar}>
        <span className={styles.count} aria-live="polite">
          {many ? `${index + 1} / ${images.length}` : ""}
        </span>
        <button type="button" className={styles.close} onClick={close} aria-label="Fotoğrafı kapat" autoFocus>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div
        ref={viewportRef}
        className={styles.viewport}
        data-testid="lightbox-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onWheel={onWheel}
      >
        <div ref={frameRef} className={styles.frame} data-testid="lightbox-frame">
          <Image
            key={image.id}
            src={image.url}
            alt={alt}
            fill
            sizes="(max-width: 768px) 150vw, 100vw"
            quality={85}
            className={styles.img}
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                ratio.current = img.naturalWidth / img.naturalHeight;
                layout();
              }
            }}
          />
        </div>
      </div>

      {many && (
        <>
          <button type="button" className={`${styles.nav} ${styles.prev}`} onClick={() => go(-1)} disabled={index === 0} aria-label="Önceki fotoğraf">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            className={`${styles.nav} ${styles.next}`}
            onClick={() => go(1)}
            disabled={index === images.length - 1}
            aria-label="Sonraki fotoğraf"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </>
      )}

      <p className={styles.hint} aria-hidden="true">
        {zoomed ? "Sürükleyerek gezinin · çift dokunarak küçültün" : "İki parmakla ya da çift dokunarak büyütün"}
      </p>
    </dialog>
  );
}
