"use client";

/**
 * HeroCarousel — sakin, performans öncelikli kampanya vitrini; ilk ekranı (başlığın altından
 * ekranın sonuna kadar) kaplar.
 *
 * - 1 slayt: sabit hero (zamanlayıcı yok)
 * - 2–4 slayt: yumuşak crossfade; görsel sadece opacity/transform ile değişir
 *   (compositor'da çalışır, layout/paint tetiklemez)
 * - Görünür kontrol yok (sayaç/ok/nokta kaldırıldı). Otomatik geçiş 7 sn; yalnızca fare metin/düğme
 *   bloğunun üstündeyken (tıklamak üzereyken slayt değişmesin), odak içerideyken, sekme gizliyken,
 *   sürükleme sürerken ve hero ekran dışındayken durur — fare hero görselinin üstünde durursa geçişler sürer.
 *   Sıradaki slaytın görseli yüklenmeden otomatik geçilmez (crossfade boş zemine açılmasın).
 * - Elle geçiş, beklemeden: parmakla/fareyle yatay sürükleme (metin parmağı izler, sıradaki görsel
 *   sürükledikçe belirir; bırakınca 50 px ya da hızlı fiske geçirir, azsa geri oturur), dokunmatik
 *   yüzeyde iki parmak yatay kaydırma, ← → tuşları. Elle geçiş kısa (0,45 sn) sürer; otomatik
 *   geçiş sonra yeni slayttan 7 sn sayarak devam eder. Komşu slaytların (önceki/sonraki) görselleri
 *   hazır tutulur, iki yöne de anında geçilir.
 * - Dikey sayfa kaydırma engellenmez (touch-action: pan-y); bağlantı/düğme üstünden sürükleme başlamaz
 * - prefers-reduced-motion: otomatik geçiş ve parallax yok, geçişler anlık
 * - Görseller: ilk slayt öncelikli; diğerleri gösterilmeden hemen önce yüklenir
 * - Masaüstünde çok hafif fare parallax'ı (±6px); rAF sadece hedefe yakınsayana
 *   kadar çalışır, sürekli döngü yok
 */

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./Hero.module.css";

export interface HeroSlide {
  id: string;
  image: string;
  /** Görsel dekoratif (metin zaten slaytta); alt, içerik yönetimi/SEO notu içindir */
  imageAlt: string;
  /** Masaüstü odak noktası (CSS object-position). Fotoğraf slaytlarında görsel kırpılırken neyin kalacağını belirler. */
  objectPosition?: string;
  /** Mobil odak noktası; verilmezse objectPosition kullanılır. */
  objectPositionMobile?: string;
  /**
   * "artwork": metni görselin içinde olan kampanya afişi — masaüstünde kırpılmadan (contain)
   * gösterilir, üstüne başlık basılmaz (başlık sadece ekran okuyucuya), yalnızca CTA alt kısımda
   * görünür. Mobilde afiş üstte, canlı metin ve düğme altında dizilir. `background` boş kalan
   * kenarları doldurur.
   */
  variant?: "photo" | "artwork";
  /** artwork: görselin en/boy oranı (genişlik/yükseklik). Mobil yerleşim için gerekli. */
  artRatio?: number;
  /**
   * "light": açık zeminli afiş — düğme ve metin koyu çizilir
   * (varsayılan krem renkli düğmeler açık zeminde kaybolur).
   */
  tone?: "dark" | "light";
  /** Fotoğraf slaytlarında metin bloğunun masaüstündeki yeri (varsayılan sol). Görselin öznesi solda ise "right". */
  align?: "left" | "right";
  background?: string;
  eyebrow: string;
  title: string;
  /** Başlığın altında süs: "drizzle" = slayt açılınca kendini çizen ince zeytinyağı akışı (sıkmalı şişe) */
  accent?: "drizzle";
  text: string;
  /** Metnin altında kısa bilgi etiketleri (yalnız ürünün/etiketin doğruladığı bilgiler) */
  highlights?: string[];
  /** Düğmelerin üstünde küçük bilgi notu (örn. kapsam sınırı) */
  note?: string;
  primary: { label: string; href: string; external?: boolean };
  secondary?: { label: string; href: string; external?: boolean };
}

type CSSVars = CSSProperties & Record<`--${string}`, string | number | undefined>;

const INTERVAL_MS = 7000;
const SWIPE_THRESHOLD = 50; // px — bundan uzun sürükleme geçirir
const FLICK_MIN_PX = 20; // kısa ama hızlı fiske de geçirir
const FLICK_SPEED = 0.45; // px/ms
const AXIS_LOCK_PX = 8; // yön bu kadar hareketten sonra belirlenir (yatay = bizim, dikey = sayfa)
const WHEEL_THRESHOLD = 60; // dokunmatik yüzey yatay kaydırma birikimi
const SETTLE_MS = 320; // yetersiz sürüklemede geri oturma süresi (CSS .settling ile aynı)

/**
 * Sıkmalı şişeden akan ince zeytinyağı çizgisi: slayt etkinleşince soldan sağa kendini çizer,
 * ucunda bir damla belirir (CSS: .drizzle). Hareket azaltmada çizgi hazır çizili görünür.
 */
function DrizzleAccent() {
  return (
    <svg className={styles.drizzle} viewBox="0 0 240 30" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="hero-drizzle-oil" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e3c35a" />
          <stop offset="0.55" stopColor="#c9a84c" />
          <stop offset="1" stopColor="#a8973a" />
        </linearGradient>
      </defs>
      <path
        className={styles.drizzlePath}
        pathLength={1}
        d="M3 13 C 24 3, 40 23, 62 13 S 100 3, 122 13 S 160 23, 182 13 S 212 5, 226 12"
        fill="none"
        stroke="url(#hero-drizzle-oil)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        className={styles.drizzleDrop}
        d="M232 14 c 2.6 3.6 3.9 6 3.9 7.7 a 3.9 3.9 0 0 1 -7.8 0 c 0 -1.7 1.3 -4.1 3.9 -7.7 z"
        fill="#c9a84c"
      />
    </svg>
  );
}

function CtaLink({
  cta,
  className,
}: {
  cta: HeroSlide["primary"];
  className: string;
}) {
  if (cta.external) {
    return (
      <a href={cta.href} className={className} target="_blank" rel="noopener noreferrer">
        {cta.label}
      </a>
    );
  }
  return (
    <Link href={cta.href} className={className}>
      {cta.label}
    </Link>
  );
}

export default function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const total = slides.length;
  const isCarousel = total > 1;

  const [active, setActive] = useState(0);
  const [manual, setManual] = useState(false); // son geçiş elle mi (kısa geçiş süresi)
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false); // yetersiz sürükleme geri oturuyor
  const [peek, setPeek] = useState<number | null>(null); // sürüklerken belirmeye başlayan slayt
  const [hoverPaused, setHoverPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  // Gösterilmiş ya da sıradaki slaytların görselleri DOM'a eklenir
  const [mounted, setMounted] = useState<Set<number>>(() => new Set([0]));
  // Görseli yüklenmiş slaytlar (ilk slayt sunucudan geldiği için hazır sayılır)
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set([0]));

  const rootRef = useRef<HTMLElement>(null);
  const parallaxRef = useRef<HTMLDivElement>(null);
  const nextReadyRef = useRef(true);
  const activeRef = useRef(0);

  const playing = isCarousel && !hoverPaused && !dragging && inView && !reducedMotion;

  const markLoaded = useCallback((index: number) => {
    setLoaded((prev) => (prev.has(index) ? prev : new Set(prev).add(index)));
  }, []);

  const goTo = useCallback(
    (index: number, byUser = false) => {
      const next = ((index % total) + total) % total;
      setActive(next);
      setManual(byUser);
    },
    [total]
  );

  // Etkin slaytın ve iki komşusunun görselini DOM'a ekle (elle iki yöne de anında geçilsin)
  const mountAround = useCallback(
    (center: number) => {
      setMounted((prev) => {
        const want = [center, (center + 1) % total, (center - 1 + total) % total];
        if (want.every((i) => prev.has(i))) return prev;
        const s = new Set(prev);
        want.forEach((i) => s.add(i));
        return s;
      });
    },
    [total]
  );

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Komşu slaytların görsellerini önceden yükle
  useEffect(() => {
    if (!isCarousel) return;
    const timer = window.setTimeout(() => mountAround(active), active === 0 ? 1200 : 0); // ilk açılışta LCP görselini beklet
    return () => window.clearTimeout(timer);
  }, [active, isCarousel, mountAround]);

  // Hareket azaltma tercihi
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Ekran dışındayken ve sekme gizliyken dur
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !isCarousel) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting && !document.hidden), {
      threshold: 0.25,
    });
    io.observe(el);
    const onVis = () => setInView(!document.hidden && el.getBoundingClientRect().bottom > 0);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isCarousel]);

  // Sıradaki slaytın görseli hazır mı (zamanlayıcı bunu süre dolunca okur)
  useEffect(() => {
    nextReadyRef.current = loaded.has((active + 1) % total);
  }, [loaded, active, total]);

  // Otomatik geçiş: süre dolunca sıradaki görsel hazırsa geç, değilse hazır olana dek bekle
  useEffect(() => {
    if (!playing) return;
    let t = window.setTimeout(function tick() {
      if (nextReadyRef.current) goTo(active + 1);
      else t = window.setTimeout(tick, 300);
    }, INTERVAL_MS);
    return () => window.clearTimeout(t);
  }, [playing, active, goTo]);

  // Fare parallax'ı (masaüstü, hareket azaltma kapalıyken)
  useEffect(() => {
    const el = rootRef.current;
    const layer = parallaxRef.current;
    if (!el || !layer) return;
    if (!window.matchMedia("(pointer: fine)").matches || reducedMotion) return;

    const MAX = 6;
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let raf = 0;

    const tick = () => {
      cur.x += (target.x - cur.x) * 0.08;
      cur.y += (target.y - cur.y) * 0.08;
      layer.style.transform = `translate3d(${cur.x.toFixed(2)}px, ${cur.y.toFixed(2)}px, 0)`;
      raf =
        Math.abs(target.x - cur.x) > 0.05 || Math.abs(target.y - cur.y) > 0.05
          ? requestAnimationFrame(tick)
          : 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width - 0.5) * -2 * MAX;
      target.y = ((e.clientY - r.top) / r.height - 0.5) * -2 * MAX;
      kick();
    };
    const onLeave = () => {
      target.x = 0;
      target.y = 0;
      kick();
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, [reducedMotion]);

  // Elle kaydırma: dokunmatik, kalem ve fare sürüklemesi + dokunmatik yüzey yatay kaydırması.
  // Sürüklerken yeniden çizim yok: metnin kayması ve sıradaki görselin belirmesi CSS değişkenleriyle
  // (--drag-x, --peek) yürür; React yalnız yön belirlenince ve bırakınca güncellenir.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !isCarousel) return;

    type Gesture = {
      id: number;
      mouse: boolean;
      x0: number;
      y0: number;
      axis: "x" | "y" | null;
      lastX: number;
      lastT: number;
      v: number;
    };
    let g: Gesture | null = null;
    let peekIdx: number | null = null;
    let dragged = false; // sürüklemenin ardından gelen tıklamayı yut
    let settleTimer = 0;

    const setVars = (dx: number, p: number) => {
      el.style.setProperty("--drag-x", `${dx.toFixed(1)}px`);
      el.style.setProperty("--peek", p.toFixed(3));
    };
    const targetFor = (dx: number) => (activeRef.current + (dx < 0 ? 1 : -1) + total) % total;

    const onDown = (e: PointerEvent) => {
      dragged = false;
      if (g || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
      if ((e.target as Element).closest("a, button, input, select, textarea, label")) return;
      if (e.pointerType === "mouse") e.preventDefault(); // metin seçimi / görsel sürükleme başlamasın
      g = {
        id: e.pointerId,
        mouse: e.pointerType === "mouse",
        x0: e.clientX,
        y0: e.clientY,
        axis: null,
        lastX: e.clientX,
        lastT: e.timeStamp,
        v: 0,
      };
      mountAround(activeRef.current);
    };

    const onMove = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (!g.axis) {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (g.axis === "y") {
          g = null; // dikey: sayfa kaydırması tarayıcının
          return;
        }
        if (g.mouse) el.setPointerCapture(e.pointerId);
        window.clearTimeout(settleTimer);
        setSettling(false);
        setDragging(true);
      }
      dragged = true;
      const target = targetFor(dx);
      if (target !== peekIdx) {
        peekIdx = target;
        setPeek(target);
      }
      const p = Math.min(1, Math.abs(dx) / Math.max(1, el.clientWidth * 0.4));
      setVars(dx * 0.5, p);
      const dt = e.timeStamp - g.lastT;
      if (dt > 0) g.v = (e.clientX - g.lastX) / dt;
      g.lastX = e.clientX;
      g.lastT = e.timeStamp;
    };

    const finish = (e: PointerEvent, cancelled: boolean) => {
      if (!g || e.pointerId !== g.id) return;
      const s = g;
      g = null;
      if (s.axis !== "x") return;
      const dx = e.clientX - s.x0;
      // Parmak durup bırakıldıysa eski hız sayılmasın
      const v = e.timeStamp - s.lastT < 80 ? s.v : 0;
      const commit =
        !cancelled &&
        (Math.abs(dx) >= SWIPE_THRESHOLD ||
          (Math.abs(dx) >= FLICK_MIN_PX && Math.abs(v) >= FLICK_SPEED && Math.sign(v) === Math.sign(dx)));
      setDragging(false);
      setVars(0, 0);
      if (commit) {
        // Belirmekte olan görsel, bulunduğu opaklıktan etkin slayt olarak devam eder
        goTo(targetFor(dx), true);
        peekIdx = null;
        setPeek(null);
      } else {
        setSettling(true);
        settleTimer = window.setTimeout(() => {
          setSettling(false);
          peekIdx = null;
          setPeek(null);
        }, SETTLE_MS);
      }
    };
    const onUp = (e: PointerEvent) => finish(e, false);
    const onCancel = (e: PointerEvent) => finish(e, true);

    const onClickCapture = (e: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      e.preventDefault();
      e.stopPropagation();
    };
    const onDragStart = (e: DragEvent) => e.preventDefault();

    // Dokunmatik yüzeyde iki parmak yatay kaydırma (ve Shift + tekerlek): hareket başına bir slayt
    let wheelAcc = 0;
    let wheelLocked = false;
    let wheelTimer = 0;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // dikey: sayfa kaydırması
      e.preventDefault(); // tarayıcının "geri git" hareketi tetiklenmesin
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => {
        wheelAcc = 0;
        wheelLocked = false; // hareket (ve eylemsizlik kuyruğu) bitti
      }, 220);
      if (wheelLocked || g) return;
      wheelAcc += e.deltaX;
      if (Math.abs(wheelAcc) >= WHEEL_THRESHOLD) {
        mountAround(activeRef.current);
        goTo(activeRef.current + (wheelAcc > 0 ? 1 : -1), true);
        wheelAcc = 0;
        wheelLocked = true;
      }
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    el.addEventListener("click", onClickCapture, true);
    el.addEventListener("dragstart", onDragStart);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("click", onClickCapture, true);
      el.removeEventListener("dragstart", onDragStart);
      el.removeEventListener("wheel", onWheel);
      window.clearTimeout(settleTimer);
      window.clearTimeout(wheelTimer);
    };
  }, [isCarousel, total, goTo, mountAround]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!isCarousel) return;
    if (e.key === "ArrowRight") goTo(active + 1, true);
    else if (e.key === "ArrowLeft") goTo(active - 1, true);
  };

  const current = slides[active];

  return (
    <section
      ref={rootRef}
      className={[
        styles.hero,
        isCarousel ? styles.isCarousel : "",
        current?.variant === "artwork" ? styles.artworkActive : "",
        current?.align === "right" ? styles.textRight : "",
        manual ? styles.manual : "",
        dragging ? styles.dragging : "",
        settling ? styles.settling : "",
      ].join(" ")}
      aria-roledescription={isCarousel ? "carousel" : undefined}
      aria-label={isCarousel ? "Öne çıkanlar" : "Ana görsel"}
      onFocus={() => setHoverPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setHoverPaused(false);
      }}
      onKeyDown={onKeyDown}
    >
      <div ref={parallaxRef} className={styles.parallax} aria-hidden="true">
        {slides.map((slide, i) => {
          const mediaStyle: CSSVars = {
            "--pos": slide.objectPosition ?? "center",
            "--pos-m": slide.objectPositionMobile ?? slide.objectPosition ?? "center",
            "--art-ratio": slide.artRatio,
          };
          if (slide.background) mediaStyle.background = slide.background;
          return mounted.has(i) || i === active ? (
            <div
              key={slide.id}
              className={`${styles.media} ${i === active ? styles.mediaActive : ""} ${i === peek && i !== active ? styles.mediaPeek : ""} ${slide.variant === "artwork" ? styles.mediaArtwork : ""}`}
              style={mediaStyle}
            >
              <Image
                src={slide.image}
                alt={slide.imageAlt}
                fill
                loading="eager" // slayt zaten yalnızca sırası yaklaşınca DOM'a eklenir (mounted); lazy'ye gerek yok
                fetchPriority={i === 0 ? "high" : "low"}
                quality={80}
                sizes="100vw"
                className={styles.image}
                style={{ objectFit: slide.variant === "artwork" ? "contain" : "cover" }}
                onLoad={() => markLoaded(i)}
                onError={() => markLoaded(i)} // bozuk görsel geçişi kilitlemesin
              />
            </div>
          ) : null;
        })}
        <div className={styles.overlay} />
      </div>

      <div className={styles.content}>
        {slides.map((slide, i) => {
          const isActive = i === active;
          const Heading = i === 0 ? "h1" : "h2";
          const slideStyle: CSSVars = { "--art-ratio": slide.artRatio };
          return (
            <div
              key={slide.id}
              className={[
                styles.slide,
                isActive ? styles.slideActive : "",
                slide.variant === "artwork" ? styles.slideArtwork : "",
                slide.tone === "light" ? styles.slideToneLight : "",
                slide.align === "right" ? styles.slideRight : "",
              ].join(" ")}
              style={slideStyle}
              role={isCarousel ? "group" : undefined}
              aria-roledescription={isCarousel ? "slide" : undefined}
              aria-label={isCarousel ? `${i + 1} / ${total}` : undefined}
              aria-hidden={!isActive}
              inert={!isActive}
            >
              <div
                className={styles.contentInner}
                onPointerEnter={(e) => e.pointerType === "mouse" && setHoverPaused(true)}
                onPointerLeave={(e) => e.pointerType === "mouse" && setHoverPaused(false)}
              >
                <p className={styles.eyebrow}>{slide.eyebrow}</p>
                <Heading className={styles.headline}>{slide.title}</Heading>
                {slide.accent === "drizzle" && <DrizzleAccent />}
                <p className={styles.subtext}>{slide.text}</p>
                {slide.highlights && slide.highlights.length > 0 && (
                  <ul className={styles.highlights} aria-label="Öne çıkan bilgiler">
                    {slide.highlights.map((h) => (
                      <li key={h} className={styles.highlight}>
                        {h}
                      </li>
                    ))}
                  </ul>
                )}
                {slide.note && <p className={styles.note}>{slide.note}</p>}
                <div className={styles.ctas}>
                  <CtaLink cta={slide.primary} className={styles.ctaPrimary} />
                  {slide.secondary && (
                    <CtaLink cta={slide.secondary} className={styles.ctaSecondary} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
