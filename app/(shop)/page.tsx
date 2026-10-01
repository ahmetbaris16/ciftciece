import type { Metadata } from "next";
import { STORE } from "@/lib/config/store";
import Hero from "@/components/home/Hero";
import CategoryGrid from "@/components/home/CategoryGrid";
import FeaturedProducts from "@/components/home/FeaturedProducts";
import VacuumService from "@/components/home/VacuumService";
import TrustStrip from "@/components/home/TrustStrip";
import PremiumVisual from "@/components/home/PremiumVisual";
import StoreSection from "@/components/home/StoreSection";
import ReviewsSection from "@/components/home/ReviewsSection";
import SectionReveal from "@/components/ui/SectionReveal";
import { getPublishedReviews } from "@/lib/repositories/review.repository";

export const metadata: Metadata = {
  title: {
    absolute: STORE.seo.defaultTitle,
  },
  description: STORE.seo.defaultDescription,
};

// Öne çıkan ürünler ve yorumlar DB'den gelir — en geç 60 sn'de tazelenir
export const revalidate = 60;

export default async function HomePage() {
  const reviews = await getPublishedReviews().catch((err) => {
    console.error("[home] Yorumlar yüklenemedi:", err);
    return [];
  });

  // Serialize dates for client component
  const reviewsForClient = reviews.map((r) => ({
    id: r.id,
    authorName: r.authorName,
    rating: r.rating,
    text: r.text,
    date: r.date.toISOString(),
    source: r.source,
  }));

  return (
    <>
      {/* 1. Hero — no reveal, it's the first thing visible */}
      <Hero />

      {/* 2. Category grid */}
      <SectionReveal variant="fade-up">
        <CategoryGrid />
      </SectionReveal>

      {/* 3. Öne çıkan ürünler */}
      <SectionReveal variant="fade-up" delay={60}>
        <FeaturedProducts />
      </SectionReveal>

      {/* 4. Vakumlu paketleme hizmeti (hero'daki afişin hedefi: /#vakumlu-paketleme) */}
      <SectionReveal variant="fade-up">
        <VacuumService />
      </SectionReveal>

      {/* 5. Trust strip */}
      <SectionReveal variant="fade-in">
        <TrustStrip />
      </SectionReveal>

      {/* 6. Premium product visual */}
      <SectionReveal variant="fade-up" delay={80}>
        <PremiumVisual />
      </SectionReveal>

      {/* 7. Müşteri yorumları */}
      <SectionReveal variant="fade-up" delay={60}>
        <ReviewsSection reviews={reviewsForClient} />
      </SectionReveal>

      {/* 8. Mağaza + harita */}
      <SectionReveal variant="fade-up">
        <StoreSection />
      </SectionReveal>
    </>
  );
}
