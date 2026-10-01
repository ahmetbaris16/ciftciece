/**
 * Admin — Yorum Yönetimi
 * 1) Ürün değerlendirmeleri: üye müşterilerin ürün sayfasından yazdıkları — onaylanınca ürün sayfasında yayınlanır.
 * 2) Mağaza yorumları: ana sayfadaki telefon sahnesi (Google yorumları); yalnızca "yayında" olanlar görünür.
 */

import { requireAdmin } from "@/lib/auth/session";
import { getAllReviews } from "@/lib/repositories";
import { getReviewsForAdmin } from "@/lib/repositories/product-review.repository";
import AdminShell from "@/components/admin/AdminShell";
import ReviewsManager from "@/components/admin/ReviewsManager";
import ProductReviewsManager from "@/components/admin/ProductReviewsManager";

export default async function AdminYorumlarPage() {
  const user = await requireAdmin();
  const [reviews, productReviews] = await Promise.all([getAllReviews(), getReviewsForAdmin()]);
  const pending = productReviews.filter((r) => r.status === "PENDING").length;

  return (
    <AdminShell user={user} activeSection="yorumlar">
      <div style={{ padding: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#e8e4d9", margin: "0 0 0.25rem" }}>
          Yorumlar
        </h1>

        <section style={{ margin: "1.5rem 0 3rem" }} aria-labelledby="urun-degerlendirmeleri">
          <h2 id="urun-degerlendirmeleri" style={{ fontSize: "1.125rem", fontWeight: 700, color: "#e8e4d9", margin: "0 0 0.25rem" }}>
            Ürün değerlendirmeleri{" "}
            {pending > 0 && (
              <span style={{ marginLeft: 6, padding: "0.1rem 0.5rem", borderRadius: 999, background: "rgba(245,210,122,0.15)", color: "#f5d27a", fontSize: "0.8125rem" }}>
                {pending} onay bekliyor
              </span>
            )}
          </h2>
          <p style={{ fontSize: "0.875rem", color: "rgba(232,228,217,0.5)", margin: "0 0 1rem", maxWidth: 820 }}>
            Üye müşterilerin ürün sayfalarından yazdığı puan ve yorumlar. Onayladığınız değerlendirme ürün sayfasında
            &quot;Ad S.&quot; biçiminde yayınlanır; e-posta hiçbir yerde gösterilmez. &quot;Satın aldı&quot;, müşterinin ürünü üye
            girişiyle satın aldığını gösterir.
          </p>
          <ProductReviewsManager initial={productReviews} />
        </section>

        <section aria-labelledby="magaza-yorumlari">
          <h2 id="magaza-yorumlari" style={{ fontSize: "1.125rem", fontWeight: 700, color: "#e8e4d9", margin: "0 0 0.25rem" }}>
            Mağaza yorumları (ana sayfa)
          </h2>
          <p style={{ fontSize: "0.875rem", color: "rgba(232,228,217,0.5)", margin: "0 0 1.5rem", maxWidth: 820 }}>
            {reviews.length} yorum · Google yorumlarını aktarırken yazar adını, puanı, metni ve
            tarihi Google&apos;daki hâliyle aynen girin. Doğrulanmamış yorumu yayınlamayın.
          </p>
          <ReviewsManager
            initial={reviews
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((r) => ({
                id: r.id,
                authorName: r.authorName,
                rating: r.rating,
                text: r.text,
                date: r.date.toISOString().slice(0, 10),
                source: r.source,
                isPublished: r.isPublished,
                sortOrder: r.sortOrder,
              }))}
          />
        </section>
      </div>
    </AdminShell>
  );
}
