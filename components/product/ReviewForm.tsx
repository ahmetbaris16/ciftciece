"use client";

/**
 * Ürün değerlendirme formu (üye müşteri).
 *
 * - Girişsiz: "Giriş yapın / Üye olun" (girişten sonra bu bölüme döner)
 * - Girişli, daha önce yazmış: durumu (Onay bekliyor / Yayında / Yayınlanmadı) + "Düzenle"
 * - Gönderilen/düzenlenen değerlendirme her zaman admin onayına düşer.
 */

import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { ACCOUNT_MESSAGES, ReviewSchema, accountFieldErrors, type AccountField } from "@/lib/validation/account";
import type { MyProductReview } from "@/lib/repositories/product-review.repository";
import RatingStars from "./RatingStars";
import styles from "./ProductReviews.module.css";

const RATING_WORDS = ["", "Hiç beğenmedim", "Beğenmedim", "İdare eder", "Beğendim", "Çok beğendim"];
const TEXT_MAX = 1500;

type Load =
  | { state: "loading" }
  | { state: "guest" }
  | { state: "ready"; review: MyProductReview | null }
  | { state: "error" };

export default function ReviewForm({ productId, productSlug }: { productId: string; productSlug: string }) {
  const id = useId();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<Partial<Record<AccountField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSent, setJustSent] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/reviews?productId=${encodeURIComponent(productId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { loggedIn: boolean; review?: MyProductReview | null }) => {
        if (!alive) return;
        setLoad(d.loggedIn ? { state: "ready", review: d.review ?? null } : { state: "guest" });
      })
      .catch((err) => {
        console.error("[yorum] Durum alınamadı:", err);
        if (alive) setLoad({ state: "error" });
      });
    return () => {
      alive = false;
    };
  }, [productId]);

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
    const payload = { productId, rating, title, text };
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
        setLoad({ state: "guest" });
        setEditing(false);
        return;
      }
      if (!res.ok) {
        setErrors(data?.fieldErrors ?? {});
        setFormError(data?.error ?? ACCOUNT_MESSAGES.unavailable);
        return;
      }
      setLoad({ state: "ready", review: data.review as MyProductReview });
      setEditing(false);
      setJustSent(true);
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
        <p className={styles.formTitle}>Bu ürünü kullandınız mı?</p>
        <p className={styles.formText}>
          Puan verip yorum yazmak için üye girişi yapın. Yorumlar onaylandıktan sonra yayınlanır.
        </p>
        <div className={styles.formActions}>
          <Link href={`/giris?next=${encodeURIComponent(back)}`} className={styles.btnPrimary}>
            Giriş Yap
          </Link>
          <Link href={`/uye-ol?next=${encodeURIComponent(back)}`} className={styles.btnSecondary}>
            Üye Ol
          </Link>
        </div>
      </div>
    );
  }

  const mine = load.review;

  if (!editing) {
    if (!mine) {
      return (
        <div className={styles.formBox}>
          <p className={styles.formTitle}>Bu ürünü kullandınız mı?</p>
          <p className={styles.formText}>Deneyiminizi paylaşın; diğer müşterilere yol gösterin.</p>
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
          ? "Değerlendirmeniz yayınlanmadı. Düzenleyip yeniden gönderebilirsiniz."
          : "Değerlendirmeniz onay bekliyor; onaylandıktan sonra burada yayınlanacak.";
    return (
      <div className={styles.formBox}>
        {justSent && <p className={styles.formSuccess}>Teşekkürler! Değerlendirmeniz bize ulaştı.</p>}
        <p className={styles.formTitle}>Sizin değerlendirmeniz</p>
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
        <div className={styles.formActions}>
          <button type="button" className={styles.btnSecondary} onClick={() => startEdit(mine)}>
            Düzenle
          </button>
        </div>
      </div>
    );
  }

  const shown = hover || rating;

  return (
    <form className={styles.formBox} onSubmit={submit} noValidate>
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
        Yorumunuz adınız ve soyadınızın baş harfiyle (ör. &quot;Ayşe K.&quot;) yayınlanır; e-postanız gösterilmez.
        Yorumlar onaylandıktan sonra yayına alınır.
      </p>

      {formError && (
        <p className={styles.formErrorBox} role="alert">
          {formError}
        </p>
      )}

      <div className={styles.formActions}>
        <button type="submit" className={styles.btnPrimary} disabled={busy}>
          {busy ? "Gönderiliyor…" : "Gönder"}
        </button>
        <button type="button" className={styles.btnGhost} onClick={() => setEditing(false)} disabled={busy}>
          Vazgeç
        </button>
      </div>
    </form>
  );
}
