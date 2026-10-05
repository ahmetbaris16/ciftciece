/**
 * Ürün adresi (slug) ürün adından üretilir; yönetici yazmaz. Aynı adres varsa sonuna -2, -3… eklenir.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { firstFreeSlug, slugify } from "@/lib/catalog/slug";

test("Türkçe ad sade adrese çevrilir", () => {
  assert.equal(slugify("Naturel Sızma Zeytinyağı 1 L"), "naturel-sizma-zeytinyagi-1-l");
  assert.equal(slugify("  ÇİFTÇİ Ece — Gemlik & Kıvırcık  "), "ciftci-ece-gemlik-kivircik");
  assert.equal(slugify("Kâse / Şişe (500 ml)"), "kase-sise-500-ml");
  assert.equal(slugify("!!!"), "urun");
  assert.ok(slugify("x".repeat(200)).length <= 80);
});

test("aynı adres varsa sıradaki boş adres", () => {
  assert.equal(firstFreeSlug("zeytin", []), "zeytin");
  assert.equal(firstFreeSlug("zeytin", ["zeytin", "zeytinyagi"]), "zeytin-2");
  assert.equal(firstFreeSlug("zeytin", ["zeytin", "zeytin-2", "zeytin-3"]), "zeytin-4");
});
