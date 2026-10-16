/**
 * Mağaza yorumları (ana sayfadaki telefon sahnesi): en yeni yorum üstte, aynı tarihliler sortOrder'a göre,
 * yayında olmayan görünmez; kataloğa eklenen yorum seed'de bulunur.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { getPublishedReviews } from "@/lib/repositories/review.repository";
import { REVIEWS } from "../prisma/catalog";
import { setupTestDb } from "./helpers/db";

setupTestDb();

const review = (authorName: string, date: string, sortOrder: number, isPublished = true) => ({
  authorName,
  rating: 5,
  text: "",
  date: new Date(date),
  source: "google",
  sortOrder,
  isPublished,
});

test("yorumlar en yeni tarih üstte; aynı tarihliler sortOrder'a göre; yayında olmayan görünmez", async () => {
  await prisma.review.createMany({
    data: [
      review("Eski A", "2026-06-26", 1),
      review("Eski B", "2026-06-26", 2),
      review("Yeni", "2026-09-16", 4),
      review("Gizli", "2026-10-01", 5, false),
      review("Orta", "2026-08-02", 3),
    ],
  });
  const names = (await getPublishedReviews()).map((r) => r.authorName);
  assert.deepEqual(names, ["Yeni", "Orta", "Eski A", "Eski B"]);

  // Sonradan eklenen daha yeni yorum en üste gelir, eskiler aşağı kayar
  await prisma.review.create({ data: review("En yeni", "2026-10-20", 5) });
  const after = (await getPublishedReviews()).map((r) => r.authorName);
  assert.deepEqual(after, ["En yeni", "Yeni", "Orta", "Eski A", "Eski B"]);
});

test("katalogdaki yorumlar: yeni yorum var, en yenisi başta, kimse tarihsiz değil", () => {
  const newest = [...REVIEWS].sort((a, b) => b.date.getTime() - a.date.getTime() || a.sortOrder - b.sortOrder)[0];
  assert.equal(newest.authorName, "Huseyin Celikkiran");
  assert.equal(newest.rating, 5);
  assert.ok(newest.text.length > 0);
  assert.ok(REVIEWS.every((r) => !Number.isNaN(r.date.getTime())));
  assert.equal(new Set(REVIEWS.map((r) => `${r.source}:${r.authorName}`)).size, REVIEWS.length, "seed yazar+kaynak ile tekilleştirir");
});
