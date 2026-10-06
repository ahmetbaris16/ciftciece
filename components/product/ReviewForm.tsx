"use client";

/**
 * Ürün değerlendirme formu — yalnız ürünü satın almış müşteri, sipariş teslim edildikten sonra yazar; gönderince
 * hemen yayınlanır.
 *
 * Ürün sayfası (üye):
 * - Girişsiz: "Giriş yapın" ya da üye olmadan verdiği siparişi bulsun (sipariş sayfasından değerlendirir)
 * - Yönetici hesabı: değerlendirme yazılmaz (uygunsuz yorumu listedeki "Yayından kaldır" ile kaldırır)
 * - Satın almamış: neden yazamadığı; sipariş verilmiş ama teslim edilmemişse "teslim edilince"
 * - Daha önce yazmış: durumu (Yayında / Yayından kaldırıldı) + "Düzenle" (düzenleme de hemen yayınlanır)
 * Sipariş sayfası (`preset`): hak sunucuda denetlendi (sipariş teslim edildi); misafir siparişinde gönderim sipariş
 * numarasıyla (orderRef), üye siparişinde oturumla yapılır. Görünüm sade (kart içinde kart yok).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { ACCOUNT_MESSAGES, ReviewSchema, accountFieldErrors, type AccountField } from "@/lib/validation/account";
import type { MyProductReview, ReviewEligibility } from "@/lib/repositories/product-review.repository";
import RatingStars from "./RatingStars";
import styles from "./ProductReviews.module.css";

const RATING_WORDS = ["", "Hiç beğenmedim", "Beğenmedim", "İdare eder", "Beğendim", "Çok beğendim"];
const TEXT_MAX = 1500;

type Load =
  | { state: "loading" }
  | { state: "guest" }
  | { state: "staff" }
  | { state: "ready"; review: MyProductReview | null; eligibility: ReviewEligibility }
  | { state: "error" };

const NOT_ELIGIBLE: Record<Exclude<ReviewEligibility, "eligible">, string> = {
  awaiting_delivery: "Siparişiniz teslim edildiğinde bu ürünü değerlendirebilirsiniz.",
  not_purchased:
    "Değerlendirmeleri yalnız bu ürünü satın alan müşterilerimiz yazar. Ürünü sitemizden aldığınızda, sipariş teslim edilince burada değerlendirme yazabilirsiniz. Üye olmadan verdiğiniz siparişi sipariş sayfasından değerlendirebilirsiniz.",
};

interface Props {
  productId: string;
  productSlug: string;
  /** Sipariş sayfası: yazılmış değerlendirme ve (misafir siparişinde) sipariş numarası; durum sorgulanmaz */
  preset?: { review: MyProductReview | null; orderRef?: string };
}

export default function ReviewForm({ productId, productSlug, preset }: Props) {
  const id = useId();
  const router = useRouter();
  const [load, setLoad] = useState<Load>(
    preset ? { state: "ready", review: preset.review, eligibility: "eligible" } : { state: "loading" }
  );
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<Partial<Record<AccountField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSent, setJustSent] = useState(false);

  const presetMode = preset !== undefined;
  const orderRef = preset?.orderRef;
  const box = presetMode ? `${styles.formBox} ${styles.formBoxFlat}` : styles.formBox;

  useEffect(() => {
    if (presetMode) return; // sipariş sayfası: hak sunucuda denetlendi
    let alive = true;
    fetch(`/api/reviews?productId=${encodeURIComponent(productId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { loggedIn: boolean; staff?: boolean; review?: MyProductReview | null; eligibility?: ReviewEligibility }) => {
        if (!alive) return;
        if (!d.loggedIn) setLoad({ state: "guest" });
        else if (d.staff) setLoad({ state: "staff" });
        else setLoad({ state: "ready", review: d.review ?? null, eligibility: d.eligibility ?? "not_purchased" });
      })
      .catch((err) => {
        console.error("[yorum] Durum alınamadı:", err);
        if (alive) setLoad({ state: "error" });
      });
    return () => {
      alive = false;
    };
  }, [productId, presetMode]);

  const startEdit = (r: MyProductReview | null) => {
    setRating(r?.rating ?? 0);
    setTitle(r?.title ?? "");
    setText(r?.text ?? "");
    setErrors({});
    setFormError(null);
    setJustSent(false);
    setEditing(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const payload = { productId, rating, title, text, ...(orderRef ? { orderRef } : {}) };
    const parsed = ReviewSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(accountFieldErrors(parsed.error).fieldErrors);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401) {
        // Sipariş sayfasında: üyelikle verilmiş siparişte oturum yok/düşmüş → giriş gerektiğini söyle
        if (presetMode) {
          setFormError(data?.error ?? "Değerlendirmek için giriş yapın.");
          return;
        }
        setLoad({ state: "guest" });
        setEditing(false);
        return;
      }
      if (!res.ok) {
        setErrors(data?.fieldErrors ?? {});
        setFormError(data?.error ?? ACCOUNT_MESSAGES.unavailable);
        return;
      }
      setLoad({ state: "ready", review: data.review as MyProductReview, eligibility: "eligible" });
      setEditing(false);
      setJustSent(true);
      // Yayınlanan değerlendirme listede görünsün: sunucu sayfa önbelleğini "sonraki ziyarette tazele" diye işaretler;
      // ilk yenileme tazelemeyi başlatır (eski kopya gelebilir), kısa süre sonraki ikinci yenileme yeni hâli getirir
      router.refresh();
      window.setTimeout(() => router.refresh(), 2000);
    } catch {
      setFormError(ACCOUNT_MESSAGES.unavailable);
    } finally {
      setBusy(false);
    }
  };

  const back = `/urun/${productSlug}#degerlendirmeler`;

  if (load.state === "loading") {
    return <div className={styles.formBox} aria-busy="true" style={{ minHeight: 120 }} />;
  }

  if (load.state === "error") {
    return (
      <div className={styles.formBox}>
        <p className={styles.formText}>Değerlendirme formu şu anda yüklenemedi. Sayfayı yenileyip tekrar deneyin.</p>
      </div>
    );
  }

  if (load.state === "guest") {
    return (
      <div className={styles.formBox}>
        <p className={styles.formTitle}>Bu ürünü satın aldınız mı?</p>
        <p className={styles.formText}>
          Değerlendirmeleri ürünü satın alan müşterilerimiz, ürün teslim edildikten sonra yazar. Üyeyseniz giriş yapın. Üye
          olmadan sipariş verdiyseniz sipariş sayfanızdan değerlendirebilirsiniz: teslimat e-postasındaki bağlantıyla ya da
          sipariş numaranızla.
        </p>
        <div className={styles.formActions}>
          <Link href={`/giris?next=${encodeURIComponent(back)}`} className={styles.btnPrimary}>
            Giriş Yap
          </Link>
          <Link href="/siparis-takip" className={styles.btnSecondary}>
            Siparişimi Bul
          </Link>
        </div>
      </div>
    );
  }

  if (load.state === "staff") {
    return (
      <div className={styles.formBox}>
        <p className={styles.formTitle}>Yönetici hesabıyla giriş yaptınız</p>
        <p className={styles.formText}>
          Değerlendirmeleri ürünü satın alan müşteriler yazar ve hemen yayınlanır. Hakaret, kişisel bilgi ya da ürünle
          ilgisi olmayan bir yorumu altındaki &quot;Yayından kaldır&quot; ile kaldırabilirsiniz.
        </p>
      </div>
    );
  }

  const mine = load.review;
  const canWrite = load.eligibility === "eligible";

  if (!editing) {
    if (!mine) {
      if (load.eligibility !== "eligible") {
        return (
          <div className={styles.formBox}>
            <p className={styles.formTitle}>Bu ürünü değerlendirin</p>
            <p className={styles.formText}>{NOT_ELIGIBLE[load.eligibility]}</p>
          </div>
        );
      }
      if (presetMode) {
        return (
          <div className={box}>
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => startEdit(null)}>
                Değerlendirme Yaz
              </button>
            </div>
          </div>
        );
      }
      return (
        <div className={styles.formBox}>
          <p className={styles.formTitle}>Bu ürünü satın aldınız</p>
          <p className={styles.formText}>Deneyiminizi paylaşın; diğer müşterilere yol gösterin. Değerlendirmeniz hemen yayınlanır.</p>
          <div className={styles.formActions}>
            <button type="button" className={styles.btnPrimary} onClick={() => startEdit(null)}>
              Değerlendirme Yaz
            </button>
          </div>
        </div>
      );
    }
    const statusText =
      mine.status === "APPROVED"
        ? "Değerlendirmeniz yayında."
        : mine.status === "REJECTED"
          ? "Değerlendirmeniz mağaza tarafından yayından kaldırıldı (hakaret, kişisel bilgi ya da ürünle ilgisiz içerik). Düzenleyip yeniden yayınlayabilirsiniz."
          : "Değerlendirmeniz yayında değil. Düzenleyip kaydederseniz yayınlanır.";
    return (
      <div className={box}>
        {justSent && <p className={styles.formSuccess}>Teşekkürler! Değerlendirmeniz yayınlandı.</p>}
        {!presetMode && <p className={styles.formTitle}>Sizin değerlendirmeniz</p>}
        <p
          className={`${styles.statusPill} ${
            mine.status === "APPROVED" ? styles.pillOk : mine.status === "REJECTED" ? styles.pillBad : styles.pillWait
          }`}
        >
          {statusText}
        </p>
        <div className={styles.mineBody}>
          <RatingStars value={mine.rating} size={16} />
          {mine.title && <p className={styles.reviewTitle}>{mine.title}</p>}
          <p className={styles.reviewText}>{mine.text}</p>
        </div>
        {canWrite ? (
          <div className={styles.formActions}>
            <button type="button" className={styles.btnSecondary} onClick={() => startEdit(mine)}>
              Düzenle
            </button>
          </div>
        ) : (
          mine.status !== "APPROVED" && load.eligibility !== "eligible" && (
            <p className={styles.formText}>{NOT_ELIGIBLE[load.eligibility]}</p>
          )
        )}
      </div>
    );
  }

  const shown = hover || rating;

  return (
    <form className={box} onSubmit={submit} noValidate>
      <p className={styles.formTitle}>{mine ? "Değerlendirmenizi düzenleyin" : "Değerlendirme yazın"}</p>

      <fieldset className={styles.starField}>
        <legend className={styles.label}>Puanınız</legend>
        <div className={styles.starRow} onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className={`${styles.starOption} ${n <= shown ? styles.starOn : ""}`}
              onMouseEnter={() => setHover(n)}
            >
              <input
                type="radio"
                name={`${id}-rating`}
                value={n}
                checked={rating === n}
                onChange={() => {
                  setRating(n);
                  setErrors((er) => ({ ...er, rating: undefined }));
                }}
                className={styles.srOnly}
              />
              <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6z"
                  fill="currentColor"
                />
              </svg>
              <span className={styles.srOnly}>
                {n} yıldız — {RATING_WORDS[n]}
              </span>
            </label>
          ))}
          <span className={styles.ratingWord} aria-hidden="true">
            {shown ? RATING_WORDS[shown] : "Yıldız seçin"}
          </span>
        </div>
        {errors.rating && <p className={styles.fieldError}>{errors.rating}</p>}
      </fieldset>

      <div className={styles.field}>
        <label htmlFor={`${id}-title`} className={styles.label}>
          Başlık <span className={styles.optional}>(isteğe bağlı)</span>
        </label>
        <input
          id={`${id}-title`}
          className={styles.input}
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Örn. Salatada harika"
        />
        {errors.title && <p className={styles.fieldError}>{errors.title}</p>}
      </div>

      <div className={styles.field}>
        <label htmlFor={`${id}-text`} className={styles.label}>
          Yorumunuz
        </label>
        <textarea
          id={`${id}-text`}
          className={styles.textarea}
          value={text}
          maxLength={TEXT_MAX}
          rows={5}
          onChange={(e) => {
            setText(e.target.value);
            setErrors((er) => ({ ...er, text: undefined }));
          }}
          placeholder="Tadı, kullanımı, paketlemesi… Neyi beğendiniz, neyi beğenmediniz?"
          aria-invalid={errors.text ? true : undefined}
        />
        <div className={styles.textMeta}>
          {errors.text ? <p className={styles.fieldError}>{errors.text}</p> : <span />}
          <span className={styles.counter}>
            {text.length}/{TEXT_MAX}
          </span>
        </div>
      </div>

      <p className={styles.formNote}>
        Yorumunuz adınız ve soyadınızın baş harfiyle (ör. &quot;Ayşe K.&quot;) ve &quot;Satın aldı&quot; işaretiyle hemen
        yayınlanır; e-postanız gösterilmez. Hakaret, kişisel bilgi ya da ürünle ilgisi olmayan içerik yayından kaldırılabilir.
      </p>

      {formError && (
        <p className={styles.formErrorBox} role="alert">
          {formError}
        </p>
      )}

      <div className={styles.formActions}>
        <button type="submit" className={styles.btnPrimary} disabled={busy}>
          {busy ? "Yayınlanıyor…" : "Yayınla"}
        </button>
        <button type="button" className={styles.btnGhost} onClick={() => setEditing(false)} disabled={busy}>
          Vazgeç
        </button>
      </div>
    </form>
  );
}
