"use client";

/**
 * ReviewsSection — gerçek bir akıllı telefonda Google Haritalar işletme ekranı gibi görünür.
 *
 * - Telefon: metal çerçeve, yan tuşlar, dinamik ada, ekran yansıması, zemin gölgesi; hafif perspektif.
 * - Ekran: gerçek yerel saat (dakikada bir güncellenir), sinyal/Wi-Fi/pil simgeleri (dekoratif: aria-hidden),
 *   üç sekme ve paylaş düğmesi ÇALIŞIR:
 *     · Genel Bakış: puan, ara / konum / paylaş düğmeleri, adres, açık-kapalı durumu ve saatler, telefon
 *     · Yorumlar (açılışta): puan özeti (gerçek yorumlardan hesaplanır) ve yorum listesi (DB'deki gerçek yorumlar)
 *     · Hakkında: işletme açıklaması, hizmetler, Instagram
 *   Bilgiler lib/config/store.ts'den ve sitenin mevcut metinlerinden gelir (TrustStrip, VacuumService); burada
 *   yeni iddia yazılmaz.
 * - Paylaş (üstteki simge ve Genel Bakış'taki düğme): telefonun içinde alttan açılan panel — WhatsApp, e-posta,
 *   (tarayıcı destekliyorsa) cihazın paylaşım menüsü ve bağlantıyı kopyala. Paylaşılan adres sitenin ana sayfasıdır.
 *   Açıkken arka plan inert (klavye/ekran okuyucu panelin içinde kalır); Esc, ✕ ya da karartıya tıklama kapatır,
 *   odak açan düğmeye döner.
 * - Sekmeler WAI-ARIA sekme kalıbıyla: ← → Home End ile gezilir. Diğer sekmelerin içeriği `hidden` ile DOM'da durur.
 * - Yorumlar dikey kaydırılır (telefondaki gibi); içerik ekrana sığıyorsa sayfa kaydırması engellenmez.
 * - Giriş: CSS scroll-driven animation (animation-timeline: view()); desteklemeyen tarayıcıda
 *   IntersectionObserver ile tek seferlik yumuşak giriş. Scroll hijacking YOK.
 * - Performans: yeni hareketler yalnız transform/opacity; blur/backdrop-filter yok; ek bağımlılık yok.
 * - prefers-reduced-motion: giriş, eğim, sekme ve panel geçişleri kapalı.
 */

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { STORE, getFormattedHours, getStoreStatus } from "@/lib/config/store";
import styles from "./ReviewsSection.module.css";

interface Review {
  id: string;
  authorName: string;
  /** Yazarın rozeti (ör. "Yerel Rehber") */
  authorBadge?: string | null;
  rating: number;
  text: string;
  date: string;
  source: string | null;
}

interface ReviewsSectionProps {
  reviews: Review[];
}

type TabKey = "overview" | "reviews" | "about";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Genel Bakış" },
  { key: "reviews", label: "Yorumlar" },
  { key: "about", label: "Hakkında" },
];

const AVATAR_COLORS = ["#1a73e8", "#d93025", "#188038", "#e37400", "#9334e6", "#0b8a9b"];

function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toLocaleUpperCase("tr-TR")
    .slice(0, 2);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("tr-TR", { year: "numeric", month: "long" });
}

function sourceLabel(source: string | null): string | null {
  if (!source) return null;
  if (source.toLowerCase() === "google") return "Google yorumu";
  if (source.toLowerCase() === "manual") return "Mağaza müşterisi";
  return source;
}

/** Telefonun saati: sunucuda sabit, tarayıcıda gerçek yerel saat (uyuşmazlık olmasın diye mount sonrası) */
function usePhoneTime(): string {
  const [time, setTime] = useState("09:41");
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 20000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);
  return time;
}

type StoreStatus = ReturnType<typeof getStoreStatus>;

/** Mağaza açık mı: tarayıcı saatine bağlı, SSR ile uyuşmazlık olmasın diye mount sonrası; durum değişmedikçe yeniden çizmez */
function useStoreStatus(): StoreStatus | null {
  const [status, setStatus] = useState<StoreStatus | null>(null);
  useEffect(() => {
    const update = () => {
      const next = getStoreStatus();
      setStatus((prev) =>
        prev && prev.isOpen === next.isOpen && prev.label === next.label && prev.closesAt === next.closesAt && prev.opensAt === next.opensAt
          ? prev
          : next
      );
    };
    const first = window.setTimeout(update, 0);
    const id = window.setInterval(update, 60000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);
  return status;
}

const noopSubscribe = () => () => {};

/** Sitenin ana sayfa adresi (paylaşılan bağlantı). Sunucuda boş; tarayıcıda gerçek adres — uyuşmazlık olmaz. */
function useSiteUrl(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => `${window.location.origin}/`,
    () => ""
  );
}

/** Tarayıcının/cihazın paylaşım menüsü (Web Share API) var mı */
function useCanNativeShare(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator.share === "function",
    () => false
  );
}

const SHARE_TEXT = `${STORE.name} — ${STORE.description}`;

/** Panoya kopyalar: önce Clipboard API; olmazsa (eski tarayıcı, güvenli olmayan bağlantı) geçici alan + execCommand. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // izin verilmedi ya da sayfa odakta değil: yedek yöntem
  }
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    // 16px: iOS odaklanınca yakınlaştırmasın
    area.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  } finally {
    previous?.focus({ preventScroll: true });
  }
}

/** Her gün aynı saatse tek satır ("07:00 – 00:00"); değilse null (gün gün liste gösterilir) */
const HOURS = getFormattedHours();
const hoursText = (h: (typeof HOURS)[number]) => (h.isOpen ? `${h.open} – ${h.close}` : "Kapalı");
const UNIFORM_HOURS = HOURS.every((h) => h.isOpen === HOURS[0].isOpen && h.open === HOURS[0].open && h.close === HOURS[0].close)
  ? hoursText(HOURS[0])
  : null;

function statusDetail(s: StoreStatus): string {
  if (s.isOpen) return s.closesAt === "00:00" ? "gece yarısına kadar" : `${s.closesAt}'e kadar`;
  return s.opensAt ? `${s.opensAt}'de açılıyor` : "";
}

/** Yazar rozeti için küçük simge (dekoratif; metin yanında) */
function GuideIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.itemBadgeIcon} aria-hidden="true">
      <path d="M12 2.2a7.3 7.3 0 0 0-7.3 7.3c0 5.2 7.3 12.3 7.3 12.3s7.3-7.1 7.3-12.3A7.3 7.3 0 0 0 12 2.2Z" />
      <path className={styles.itemBadgeStar} d="m12 6.6 1.35 2.75 3.03.44-2.19 2.14.52 3.02L12 13.5l-2.71 1.45.52-3.02-2.19-2.14 3.03-.44Z" />
    </svg>
  );
}

function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  return (
    <span className={`${styles.stars} ${className}`} role="img" aria-label={`5 üzerinden ${rating} yıldız`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 24 24" className={n <= rating ? styles.starOn : styles.starOff} aria-hidden="true">
          <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      ))}
    </span>
  );
}

export default function ReviewsSection({ reviews }: ReviewsSectionProps) {
  const total = reviews.length;
  const time = usePhoneTime();
  const storeStatus = useStoreStatus();
  const [entered, setEntered] = useState(false);
  const [tab, setTab] = useState<TabKey>("reviews");
  const [shareOpen, setShareOpen] = useState(false);
  /** Her açılışta paylaş panelinin içi sıfırdan kurulur (eski "kopyalandı" notu kalmasın) */
  const [shareRun, setShareRun] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const shareTrigger = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});
  const uid = useId();
  const tabId = (k: TabKey) => `${uid}-tab-${k}`;
  const panelId = (k: TabKey) => `${uid}-panel-${k}`;
  const shareTitleId = `${uid}-share-title`;

  // Giriş animasyonu için yedek (scroll-driven animation yoksa CSS bu sınıfı kullanır)
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setEntered(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Paylaş paneli açıkken: odak panele, Esc kapatır; kapanınca odak açan düğmeye döner
  useEffect(() => {
    if (!shareOpen) return;
    sheetRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShareOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const trigger = shareTrigger.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      trigger?.focus({ preventScroll: true });
    };
  }, [shareOpen]);

  if (total === 0) return null; // yayında yorum yoksa bölüm hiç görünmez

  const avg = reviews.reduce((s, r) => s + r.rating, 0) / total;
  const avgLabel = avg.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, count: reviews.filter((r) => r.rating === n).length }));

  const openShare = (e: ReactMouseEvent<HTMLElement>) => {
    shareTrigger.current = e.currentTarget;
    setShareRun((n) => n + 1);
    setShareOpen(true);
  };
  const closeShare = () => setShareOpen(false);

  const onTabKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.key === tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i + TABS.length - 1) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const key = TABS[next].key;
    setTab(key);
    tabRefs.current[key]?.focus();
  };

  return (
    <section className={styles.section} aria-labelledby="reviews-heading">
      <div className={styles.container}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Müşteri Yorumları</p>
          <h2 id="reviews-heading" className={styles.title}>
            Mağazamıza uğrayanlar <em className={styles.titleItalic}>ne diyor?</em>
          </h2>
        </header>

        <div ref={stageRef} className={`${styles.stage} ${entered ? styles.entered : ""}`}>
          <div className={styles.phoneWrap}>
            <div className={styles.phone}>
              {/* yan tuşlar */}
              <span className={`${styles.hw} ${styles.hwAction}`} aria-hidden="true" />
              <span className={`${styles.hw} ${styles.hwVolUp}`} aria-hidden="true" />
              <span className={`${styles.hw} ${styles.hwVolDown}`} aria-hidden="true" />
              <span className={`${styles.hw} ${styles.hwPower}`} aria-hidden="true" />

              <div className={styles.bezel}>
                <div className={styles.screen}>
                  <div className={styles.island} aria-hidden="true">
                    <i />
                  </div>

                  <div className={styles.statusBar} aria-hidden="true">
                    <span className={styles.time}>{time}</span>
                    <span className={styles.sysIcons}>
                      <SignalIcon />
                      <WifiIcon />
                      <BatteryIcon />
                    </span>
                  </div>

                  <div className={styles.appBar} inert={shareOpen}>
                    <BackIcon />
                    <span className={styles.placeName} aria-hidden="true">
                      Çiftçi Ece
                    </span>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={openShare}
                      aria-label="Paylaş"
                      aria-haspopup="dialog"
                      aria-expanded={shareOpen}
                    >
                      <ShareIcon />
                    </button>
                  </div>

                  <div className={styles.tabs} role="tablist" aria-label="Mağaza bilgileri" onKeyDown={onTabKeyDown} inert={shareOpen}>
                    {TABS.map((t) => (
                      <button
                        key={t.key}
                        ref={(el) => {
                          tabRefs.current[t.key] = el;
                        }}
                        type="button"
                        role="tab"
                        id={tabId(t.key)}
                        className={styles.tab}
                        aria-selected={tab === t.key}
                        aria-controls={panelId(t.key)}
                        tabIndex={tab === t.key ? 0 : -1}
                        onClick={() => setTab(t.key)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* ── Genel Bakış ── */}
                  <div
                    role="tabpanel"
                    id={panelId("overview")}
                    aria-labelledby={tabId("overview")}
                    className={`${styles.scroller} ${styles.panel}`}
                    hidden={tab !== "overview"}
                    tabIndex={0}
                    inert={shareOpen}
                  >
                    <div className={styles.ovHead}>
                      <p className={styles.ovName}>{STORE.name}</p>
                      <p className={styles.ovTag}>{STORE.tagline}</p>
                      <p className={styles.ovRating}>
                        <span className={styles.ovRatingNum}>{avgLabel}</span>
                        <Stars rating={Math.round(avg)} className={styles.starsSm} />
                        <span>({total})</span>
                      </p>
                    </div>

                    <div className={styles.actions}>
                      <a className={styles.action} href={`tel:${STORE.contact.phone}`}>
                        <span className={styles.actionIcon} aria-hidden="true">
                          <PhoneIcon />
                        </span>
                        <span>Ara</span>
                      </a>
                      <a className={styles.action} href="#magaza">
                        <span className={styles.actionIcon} aria-hidden="true">
                          <PinIcon />
                        </span>
                        <span>Konum</span>
                      </a>
                      <button type="button" className={styles.action} onClick={openShare} aria-haspopup="dialog">
                        <span className={styles.actionIcon} aria-hidden="true">
                          <ShareIcon />
                        </span>
                        <span>Paylaş</span>
                      </button>
                    </div>

                    <ul className={styles.facts} role="list">
                      <li className={styles.fact}>
                        <span className={styles.factIcon} aria-hidden="true">
                          <PinIcon />
                        </span>
                        <div className={styles.factBody}>{STORE.address.full}</div>
                      </li>
                      <li className={styles.fact}>
                        <span className={styles.factIcon} aria-hidden="true">
                          <ClockIcon />
                        </span>
                        <div className={styles.factBody}>
                          {storeStatus && (
                            <p className={styles.factLine}>
                              <span className={storeStatus.isOpen ? styles.open : styles.closed}>
                                {storeStatus.isOpen ? "Açık" : "Kapalı"}
                              </span>
                              {statusDetail(storeStatus) && <span className={styles.factSub}> · {statusDetail(storeStatus)}</span>}
                            </p>
                          )}
                          {UNIFORM_HOURS ? (
                            <p className={styles.factLine}>Her gün {UNIFORM_HOURS}</p>
                          ) : (
                            <dl className={styles.hours}>
                              {HOURS.map((h) => (
                                <div key={h.day} className={styles.hoursRow}>
                                  <dt>{h.day}</dt>
                                  <dd>{hoursText(h)}</dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </div>
                      </li>
                      <li className={styles.fact}>
                        <span className={styles.factIcon} aria-hidden="true">
                          <PhoneIcon />
                        </span>
                        <div className={styles.factBody}>
                          <a className={styles.link} href={`tel:${STORE.contact.phone}`}>
                            {STORE.contact.phoneFormatted}
                          </a>
                        </div>
                      </li>
                    </ul>
                  </div>

                  {/* ── Yorumlar ── */}
                  <div
                    role="tabpanel"
                    id={panelId("reviews")}
                    aria-labelledby={tabId("reviews")}
                    className={`${styles.scroller} ${styles.panel}`}
                    hidden={tab !== "reviews"}
                    tabIndex={0}
                    inert={shareOpen}
                  >
                    <div className={styles.summary}>
                      <div className={styles.score}>
                        <span className={styles.scoreNum}>{avgLabel}</span>
                        <Stars rating={Math.round(avg)} className={styles.starsMd} />
                        <span className={styles.scoreCount}>{total} yorum</span>
                      </div>
                      <div className={styles.bars} aria-hidden="true">
                        {dist.map(({ n, count }) => (
                          <div key={n} className={styles.barRow}>
                            <span>{n}</span>
                            <span className={styles.barTrack}>
                              <span className={styles.barFill} style={{ width: `${(count / total) * 100}%` }} />
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <ul className={styles.list} role="list">
                      {reviews.map((review) => (
                        <li key={review.id} className={styles.item}>
                          <article>
                            <div className={styles.itemHead}>
                              <span
                                className={styles.avatar}
                                style={{ backgroundColor: avatarColor(review.authorName) }}
                                aria-hidden="true"
                              >
                                {getInitials(review.authorName)}
                              </span>
                              <div className={styles.itemWho}>
                                <p className={styles.itemName}>{review.authorName}</p>
                                {(review.authorBadge || sourceLabel(review.source)) && (
                                  <p className={styles.itemMeta}>
                                    {review.authorBadge && (
                                      <span className={styles.itemBadge}>
                                        <GuideIcon />
                                        {review.authorBadge}
                                      </span>
                                    )}
                                    {review.authorBadge && sourceLabel(review.source) && " · "}
                                    {sourceLabel(review.source)}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className={styles.itemRating}>
                              <Stars rating={review.rating} className={styles.starsSm} />
                              <span className={styles.itemDate}>{formatDate(review.date)}</span>
                            </div>
                            {review.text && <p className={styles.itemText}>{review.text}</p>}
                          </article>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* ── Hakkında ── */}
                  <div
                    role="tabpanel"
                    id={panelId("about")}
                    aria-labelledby={tabId("about")}
                    className={`${styles.scroller} ${styles.panel}`}
                    hidden={tab !== "about"}
                    tabIndex={0}
                    inert={shareOpen}
                  >
                    <section className={styles.block}>
                      <h3 className={styles.blockTitle}>İşletme hakkında</h3>
                      <p className={styles.blockText}>{STORE.description}</p>
                    </section>
                    <section className={styles.block}>
                      <h3 className={styles.blockTitle}>Hizmetler</h3>
                      <ul className={styles.perks} role="list">
                        {/* Metinler sitedeki TrustStrip ve VacuumService ile aynı kapsamdadır */}
                        <li>
                          <CheckIcon />
                          <span>Orhangazi, Zeytinciler Çarşısı&apos;nda fiziksel mağaza</span>
                        </li>
                        <li>
                          <CheckIcon />
                          <span>Sipariş verin, paketleyip gönderelim</span>
                        </li>
                        <li>
                          <CheckIcon />
                          <span>Rafımızdaki ürünlerin aynısı</span>
                        </li>
                        <li>
                          <CheckIcon />
                          <span>Siyah zeytin için vakumlu paketleme</span>
                        </li>
                      </ul>
                    </section>
                    <section className={styles.block}>
                      <h3 className={styles.blockTitle}>Bizi takip edin</h3>
                      <a
                        className={styles.social}
                        href={STORE.contact.instagramUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Instagram: ${STORE.contact.instagram} (yeni sekmede açılır)`}
                      >
                        <InstagramIcon />
                        <span>{STORE.contact.instagram}</span>
                      </a>
                    </section>
                  </div>

                  <div className={styles.homeIndicator} aria-hidden="true" />

                  {/* ── Paylaş paneli (telefonun içinde, alttan açılır) ── */}
                  <div className={`${styles.scrim} ${shareOpen ? styles.scrimOpen : ""}`} onClick={closeShare} aria-hidden="true" />
                  <div
                    ref={sheetRef}
                    role="dialog"
                    aria-labelledby={shareTitleId}
                    tabIndex={-1}
                    inert={!shareOpen}
                    className={`${styles.sheet} ${shareOpen ? styles.sheetOpen : ""}`}
                  >
                    {shareRun > 0 && <ShareBody key={shareRun} titleId={shareTitleId} onClose={closeShare} />}
                  </div>

                  <div className={styles.glare} aria-hidden="true" />
                </div>
              </div>
            </div>
            <div className={styles.groundShadow} aria-hidden="true" />
          </div>

          <div className={styles.sidePanel}>
            <p className={styles.sideScore}>
              <span className={styles.sideScoreNum}>{avgLabel}</span>
              <Stars rating={Math.round(avg)} className={styles.starsLg} />
            </p>
            <p className={styles.sideCaption}>{total} yorumun ortalaması</p>
            <div className={styles.sideActions}>
              <a
                href={STORE.address.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.sideCta}
                aria-label="Google Haritalar'da gör (yeni sekmede açılır)"
              >
                Google Haritalar&apos;da Gör
              </a>
              <Link href="/magaza" className={styles.sideLink}>
                Mağazamıza Uğrayın
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Paylaş panelinin içi: seçenekler ve bağlantı. Her açılışta yeniden kurulur (key). */
function ShareBody({ titleId, onClose }: { titleId: string; onClose: () => void }) {
  const shareUrl = useSiteUrl();
  const canNativeShare = useCanNativeShare();
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const say = (text: string, ok: boolean) => {
    window.clearTimeout(timer.current);
    setNote({ text, ok });
    timer.current = window.setTimeout(() => setNote(null), 3500);
  };

  const copy = async () => {
    const ok = await copyText(shareUrl);
    say(ok ? "Bağlantı kopyalandı" : "Kopyalanamadı. Bağlantıyı seçip elle kopyalayın.", ok);
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: STORE.name, text: SHARE_TEXT, url: shareUrl });
      onClose();
    } catch (err) {
      // Kullanıcı menüyü kapattıysa (AbortError) bir şey söylenmez
      if (!(err instanceof DOMException && err.name === "AbortError")) say("Paylaşım menüsü açılamadı.", false);
    }
  };

  const message = `${SHARE_TEXT}\n${shareUrl}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(STORE.name)}&body=${encodeURIComponent(message)}`;

  return (
    <>
      <span className={styles.sheetGrip} aria-hidden="true" />
      <div className={styles.sheetHead}>
        <h3 id={titleId} className={styles.sheetTitle}>
          Paylaş
        </h3>
        <button type="button" className={styles.sheetClose} onClick={onClose} aria-label="Kapat">
          <CloseIcon />
        </button>
      </div>
      <p className={styles.sheetPlace}>
        {STORE.name} · {STORE.address.district}
      </p>

      <ul className={styles.targets} role="list">
        <li>
          <a className={styles.target} href={whatsappHref} target="_blank" rel="noopener noreferrer" onClick={onClose}>
            <span className={`${styles.targetIcon} ${styles.tWhatsapp}`} aria-hidden="true">
              <WhatsAppIcon />
            </span>
            <span>WhatsApp</span>
          </a>
        </li>
        <li>
          <a className={styles.target} href={mailHref} onClick={onClose}>
            <span className={`${styles.targetIcon} ${styles.tMail}`} aria-hidden="true">
              <MailIcon />
            </span>
            <span>E-posta</span>
          </a>
        </li>
        {canNativeShare && (
          <li>
            <button type="button" className={styles.target} onClick={nativeShare}>
              <span className={`${styles.targetIcon} ${styles.tMore}`} aria-hidden="true">
                <MoreIcon />
              </span>
              <span>Diğer</span>
            </button>
          </li>
        )}
      </ul>

      <div className={styles.linkRow}>
        <span className={styles.linkText}>{shareUrl}</span>
        <button type="button" className={styles.copyBtn} onClick={copy}>
          <CopyIcon />
          Kopyala
        </button>
      </div>
      <p className={`${styles.note} ${note && !note.ok ? styles.noteErr : ""}`} role="status" aria-live="polite">
        {note?.text ?? ""}
      </p>
    </>
  );
}

/* ---- Telefon sistem simgeleri (dekoratif) ---- */
function SignalIcon() {
  return (
    <svg viewBox="0 0 18 12" width="1.35em" height="0.9em" aria-hidden="true">
      <rect x="0" y="8" width="3" height="4" rx="0.8" />
      <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
      <rect x="10" y="3" width="3" height="9" rx="0.8" />
      <rect x="15" y="0" width="3" height="12" rx="0.8" opacity="0.3" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg viewBox="0 0 16 12" width="1.2em" height="0.9em" aria-hidden="true">
      <path d="M8 2.6c2.2 0 4.2.9 5.7 2.3l1-1.1C12.9 2.1 10.6 1 8 1S3.1 2.1 1.3 3.8l1 1.1C3.8 3.5 5.8 2.6 8 2.6Z" />
      <path d="M8 6c1.3 0 2.5.5 3.4 1.3l1-1.1C11.3 5.2 9.7 4.5 8 4.5S4.7 5.2 3.6 6.2l1 1.1C5.5 6.5 6.7 6 8 6Z" />
      <circle cx="8" cy="9.8" r="1.4" />
    </svg>
  );
}

function BatteryIcon() {
  return (
    <svg viewBox="0 0 27 13" width="1.9em" height="0.95em" aria-hidden="true">
      <rect x="0.5" y="0.5" width="22" height="12" rx="3.6" fill="none" stroke="currentColor" opacity="0.4" />
      <rect x="2.2" y="2.2" width="15.6" height="8.6" rx="2.2" />
      <path d="M24.2 4.4v4.2c.9-.3 1.6-1.2 1.6-2.1s-.7-1.8-1.6-2.1Z" opacity="0.45" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1.6em" height="1.6em" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

/* ---- Uygulama simgeleri ---- */
const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function ShareIcon() {
  return (
    <svg {...ICON_PROPS} width="1.45em" height="1.45em">
      <circle cx="18" cy="5" r="2.6" />
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="18" cy="19" r="2.6" />
      <path d="M8.3 10.8 15.7 6.2M8.3 13.2l7.4 4.6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg {...ICON_PROPS} width="1.35em" height="1.35em">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg {...ICON_PROPS} width="1.35em" height="1.35em">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg {...ICON_PROPS} width="1.35em" height="1.35em">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...ICON_PROPS} width="1.2em" height="1.2em" strokeWidth={2.4}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg {...ICON_PROPS} width="1.3em" height="1.3em" strokeWidth={2.2}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg {...ICON_PROPS} width="1.5em" height="1.5em">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg {...ICON_PROPS} width="1.15em" height="1.15em">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1.5em" height="1.5em" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="19" cy="12" r="1.9" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg {...ICON_PROPS} width="1.55em" height="1.55em" strokeWidth={2}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg {...ICON_PROPS} width="1.35em" height="1.35em">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <path d="M17.5 6.5h.01" />
    </svg>
  );
}
