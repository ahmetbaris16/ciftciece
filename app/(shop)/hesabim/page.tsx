/**
 * Hesabım — yalnız üye müşteriler (girişsiz gelen /giris?next=/hesabim'e yönlenir)
 *
 * Bölümler (?bolum=): siparisler (varsayılan) | degerlendirmeler | bilgiler
 * - Siparişlerim: üye girişliyken verilen siparişler (misafir siparişleri e-postayla eşleştirilmez)
 * - Değerlendirmelerim: yazdığı ürün yorumları ve onay durumları
 * - Hesap Bilgileri: ad, telefon, şifre
 */

import Link from "next/link";
import { requireCustomer } from "@/lib/auth/session";
import { getCustomerOrders, getUserById } from "@/lib/account/customer.repository";
import { getMyReviews } from "@/lib/repositories/product-review.repository";
import { splitFullName } from "@/lib/validation/account";
import { ProfileForm, PasswordForm, SignOutButton } from "@/components/account/AccountForms";
import RatingStars from "@/components/product/RatingStars";
import { formatPrice } from "@/types";
import styles from "./page.module.css";

const SECTIONS = [
  { key: "siparisler", label: "Siparişlerim" },
  { key: "degerlendirmeler", label: "Değerlendirmelerim" },
  { key: "bilgiler", label: "Hesap Bilgileri" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

const ORDER_STATUS: Record<string, { label: string; tone: "wait" | "ok" | "info" | "bad" }> = {
  PENDING: { label: "Ödeme bekleniyor", tone: "wait" },
  PAID: { label: "Ödeme alındı", tone: "info" },
  PROCESSING: { label: "Hazırlanıyor", tone: "info" },
  SHIPPED: { label: "Kargoya verildi", tone: "info" },
  DELIVERED: { label: "Teslim edildi", tone: "ok" },
  CANCELLED: { label: "İptal edildi", tone: "bad" },
  REFUNDED: { label: "İade edildi", tone: "bad" },
};

const REVIEW_STATUS: Record<string, { label: string; tone: "wait" | "ok" | "bad" }> = {
  PENDING: { label: "Onay bekliyor", tone: "wait" },
  APPROVED: { label: "Yayında", tone: "ok" },
  REJECTED: { label: "Yayınlanmadı", tone: "bad" },
};

const dateFmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" });

interface Props {
  searchParams: Promise<{ bolum?: string | string[] }>;
}

export default async function HesabimPage({ searchParams }: Props) {
  const { bolum } = await searchParams;
  const raw = Array.isArray(bolum) ? bolum[0] : bolum;
  const section: SectionKey = SECTIONS.some((s) => s.key === raw) ? (raw as SectionKey) : "siparisler";

  const session = await requireCustomer(section === "siparisler" ? "/hesabim" : `/hesabim?bolum=${section}`);
  const user = await getUserById(session.id);
  const { firstName, lastName } = splitFullName(user?.name ?? session.name);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.head}>
          <div>
            <p className={styles.eyebrow}>Hesabım</p>
            <h1 className={styles.title}>Merhaba{firstName ? `, ${firstName}` : ""}</h1>
            <p className={styles.email}>{user?.email ?? session.email}</p>
          </div>
          <SignOutButton className={styles.signOut} />
        </header>

        <nav className={styles.tabs} aria-label="Hesap bölümleri">
          {SECTIONS.map((s) => (
            <Link
              key={s.key}
              href={s.key === "siparisler" ? "/hesabim" : `/hesabim?bolum=${s.key}`}
              className={`${styles.tab} ${section === s.key ? styles.tabActive : ""}`}
              aria-current={section === s.key ? "page" : undefined}
            >
              {s.label}
            </Link>
          ))}
        </nav>

        {section === "siparisler" && <OrdersSection userId={session.id} />}
        {section === "degerlendirmeler" && <ReviewsSection userId={session.id} />}
        {section === "bilgiler" && (
          <div className={styles.settings}>
            <section className={styles.panel} aria-labelledby="profile-title">
              <h2 id="profile-title" className={styles.panelTitle}>
                Kişisel bilgiler
              </h2>
              <ProfileForm
                initial={{ firstName, lastName, phone: user?.phone ?? null, email: user?.email ?? session.email }}
              />
            </section>
            <section className={styles.panel} aria-labelledby="password-title">
              <h2 id="password-title" className={styles.panelTitle}>
                Şifre değiştir
              </h2>
              <PasswordForm />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

async function OrdersSection({ userId }: { userId: string }) {
  let orders: Awaited<ReturnType<typeof getCustomerOrders>> = [];
  let failed = false;
  try {
    orders = await getCustomerOrders(userId);
  } catch (err) {
    console.error("[hesabim] Siparişler yüklenemedi:", err);
    failed = true;
  }

  if (failed) {
    return <p className={styles.error}>Siparişleriniz şu anda yüklenemedi. Lütfen biraz sonra tekrar deneyin.</p>;
  }

  if (orders.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>Henüz siparişiniz yok</p>
        <p className={styles.emptyText}>
          Üye girişiyle verdiğiniz siparişler burada listelenir. Üye olmadan verdiğiniz bir sipariş varsa{" "}
          <Link href="/siparis-takip" className={styles.link}>
            Sipariş Takibi
          </Link>
          &apos;nden sorgulayabilirsiniz.
        </p>
        <Link href="/urunler" className={styles.cta}>
          Alışverişe Başla
        </Link>
      </div>
    );
  }

  return (
    <ul className={styles.list} role="list">
      {orders.map((o) => {
        const st = ORDER_STATUS[o.status] ?? { label: o.status, tone: "info" as const };
        const first = o.items[0];
        const more = o.items.length - 1;
        return (
          <li key={o.id} className={styles.row}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>
                Sipariş <span className={styles.mono}>#{o.reference.slice(0, 10)}</span>
              </p>
              <p className={styles.rowMeta}>
                {dateFmt.format(o.createdAt)} · {first ? `${first.name} (${first.variant}) ×${first.quantity}` : ""}
                {more > 0 ? ` ve ${more} ürün daha` : ""}
              </p>
            </div>
            <span className={`${styles.badge} ${styles[`tone_${st.tone}`]}`}>{st.label}</span>
            <span className={styles.amount}>{formatPrice(o.totalKurus)}</span>
            <Link href={`/siparis/${o.reference}`} className={styles.link}>
              Detay →
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

async function ReviewsSection({ userId }: { userId: string }) {
  let reviews: Awaited<ReturnType<typeof getMyReviews>> = [];
  let failed = false;
  try {
    reviews = await getMyReviews(userId);
  } catch (err) {
    console.error("[hesabim] Değerlendirmeler yüklenemedi:", err);
    failed = true;
  }

  if (failed) {
    return <p className={styles.error}>Değerlendirmeleriniz şu anda yüklenemedi. Lütfen biraz sonra tekrar deneyin.</p>;
  }

  if (reviews.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>Henüz değerlendirme yazmadınız</p>
        <p className={styles.emptyText}>
          Ürün sayfalarındaki &quot;Değerlendirmeler&quot; bölümünden puan verip yorum yazabilirsiniz. Yorumlar
          onaylandıktan sonra yayınlanır.
        </p>
        <Link href="/urunler" className={styles.cta}>
          Ürünlere Göz At
        </Link>
      </div>
    );
  }

  return (
    <ul className={styles.list} role="list">
      {reviews.map((r) => {
        const st = REVIEW_STATUS[r.status];
        return (
          <li key={r.id} className={`${styles.row} ${styles.reviewRow}`}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>
                {r.productSlug ? (
                  <Link href={`/urun/${r.productSlug}`} className={styles.productLink}>
                    {r.productName}
                  </Link>
                ) : (
                  r.productName
                )}
              </p>
              <div className={styles.reviewMeta}>
                <RatingStars value={r.rating} size={14} />
                <span className={styles.rowMeta}>{dateFmt.format(new Date(r.updatedAt))}</span>
              </div>
              {r.title && <p className={styles.reviewTitle}>{r.title}</p>}
              <p className={styles.reviewText}>{r.text}</p>
            </div>
            <span className={`${styles.badge} ${styles[`tone_${st.tone}`]}`}>{st.label}</span>
            {r.productSlug && (
              <Link href={`/urun/${r.productSlug}#degerlendirmeler`} className={styles.link}>
                Düzenle
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
