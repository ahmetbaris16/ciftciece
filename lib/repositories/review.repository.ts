/**
 * Mağaza yorumları (ana sayfadaki telefon sahnesi: Google yorumları). Kayıtlar prisma/catalog.ts'den tohumlanır;
 * panelden yönetilmez (ürün değerlendirmeleri ayrı: lib/repositories/product-review.repository.ts).
 * DATABASE_URL yoksa (sadece development) mock veri — bkz. lib/data/source.ts.
 */

import { prisma } from "@/lib/db/prisma";
import { USE_DB, loadMock as getMock } from "@/lib/data/source";

export interface ReviewData {
  id: string;
  authorName: string;
  authorAvatar: string | null;
  rating: number;
  text: string;
  date: Date;
  source: string | null;
  sourceUrl: string | null;
  isPublished: boolean;
  sortOrder: number;
}

export async function getPublishedReviews(): Promise<ReviewData[]> {
  if (!USE_DB) {
    const mock = await getMock();
    return mock.getPublishedMockReviews();
  }

  const reviews = await prisma.review.findMany({
    where: { isPublished: true },
    orderBy: { sortOrder: "asc" },
  });

  return reviews.map((r) => ({
    id: r.id,
    authorName: r.authorName,
    authorAvatar: r.authorAvatar,
    rating: r.rating,
    text: r.text,
    date: r.date,
    source: r.source,
    sourceUrl: r.sourceUrl,
    isPublished: r.isPublished,
    sortOrder: r.sortOrder,
  }));
}
