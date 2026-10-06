"use client";

/**
 * Yayındaki değerlendirmeler — ilk 6'sı gösterilir, gerisi "Tümünü göster" ile açılır.
 * Sıralama: en yeni / en yüksek puan / en düşük puan.
 * Yönetici oturumunda her yorumun altında "Yayından kaldır" (hakaret, kişisel bilgi, ürünle ilgisiz içerik için);
 * düğme oturum tarayıcıda okununca görünür, sayfanın önbellekli hâli herkes için aynıdır.
 */

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { isStaffRole } from "@/lib/auth/roles";
import type { PublicProductReview } from "@/lib/repositories/product-review.repository";
import RatingStars from "./RatingStars";
import styles from "./ProductReviews.module.css";

const INITIAL = 6;
const dateFmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" });

type Sort = "new" | "high" | "low";

export default function ReviewList({ reviews }: { reviews: PublicProductReview[] }) {
  const [sort, setSort] = useState<Sort>("new");
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const { data: session } = useSession();
  const staff = isStaffRole((session?.user as { role?: string } | undefined)?.role);

  const visible = reviews.filter((r) => !hidden.includes(r.id));
  if (visible.length === 0) return null;

  const sorted = [...visible].sort((a, b) =>
    sort === "high"
      ? b.rating - a.rating || b.createdAt.localeCompare(a.createdAt)
      : sort === "low"
        ? a.rating - b.rating || b.createdAt.localeCompare(a.createdAt)
        : b.createdAt.localeCompare(a.createdAt)
  );
  const shown = expanded ? sorted : sorted.slice(0, INITIAL);

  return (
    <div className={styles.listWrap}>
      {visible.length > 1 && (
        <div className={styles.sortRow}>
          <label className={styles.sortLabel}>
            Sırala
            <select className={styles.sortSelect} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="new">En yeni</option>
              <option value="high">En yüksek puan</option>
              <option value="low">En düşük puan</option>
            </select>
          </label>
        </div>
      )}

      <ul className={styles.list} role="list">
        {shown.map((r) => (
          <li key={r.id} className={styles.review}>
            <div className={styles.reviewHead}>
              <span className={styles.avatar} aria-hidden="true">
                {r.authorName.charAt(0).toLocaleUpperCase("tr-TR")}
              </span>
              <div className={styles.reviewWho}>
                <span className={styles.author}>{r.authorName}</span>
                <span className={styles.date}>{dateFmt.format(new Date(r.createdAt))}</span>
              </div>
              {r.isVerifiedPurchase && (
                <span className={styles.verified}>
                  <CheckIcon /> Satın aldı
                </span>
              )}
            </div>
            <RatingStars value={r.rating} size={15} />
            {r.title && <p className={styles.reviewTitle}>{r.title}</p>}
            <p className={styles.reviewText}>{r.text}</p>
            {staff && <HideButton reviewId={r.id} onHidden={() => setHidden((h) => [...h, r.id])} />}
          </li>
        ))}
      </ul>

      {!expanded && sorted.length > INITIAL && (
        <button type="button" className={styles.more} onClick={() => setExpanded(true)}>
          Tüm değerlendirmeleri göster ({sorted.length})
        </button>
      )}
    </div>
  );
}

/** Yalnız yönetici oturumunda: uygunsuz yorumu yayından kaldırır (kayıt silinmez) */
function HideButton({ reviewId, onHidden }: { reviewId: string; onHidden: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hide = async () => {
    if (!window.confirm("Bu yorum yayından kaldırılsın mı? Yalnız hakaret, kişisel bilgi ya da ürünle ilgisi olmayan içerik için kullanın.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/product-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reviewId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Kaldırılamadı. Tekrar deneyin.");
        return;
      }
      onHidden();
      router.refresh();
    } catch {
      setError("Bağlantı hatası. Tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.moderation}>
      <button type="button" className={styles.hideBtn} onClick={hide} disabled={busy}>
        {busy ? "Kaldırılıyor…" : "Yayından kaldır"}
      </button>
      <span className={styles.moderationNote}>Yalnız size görünür</span>
      {error && (
        <span role="alert" className={styles.fieldError}>
          {error}
        </span>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
