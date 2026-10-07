/**
 * Seçenek açıklaması: kapak seçimi (yalnız sofralık siyah zeytin) — seçili seçeneğin bilgisi ve diğer seçenekle fiyat
 * farkının nedeni; fark o anki fiyatlardan hesaplanır, fiyatlar ters girilirse uydurma gerekçe yazılmaz.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { variantExplanation } from "@/lib/catalog/variant-notes";

const siyah = { sku: "SYZ-SIYAH", priceKurus: 35_000 };
const sari = { sku: "SYZ-SARI", priceKurus: 20_000 };
const both = [siyah, sari];

test("siyah kapak: jelatin var; zeytin aynı, jelatin nedeniyle kavanoz başına ₺150 fazla", () => {
  const e = variantExplanation(siyah, both);
  assert.equal(e?.note, "Kapağın altında jelatin koruma bulunur.");
  assert.equal(
    e?.compare,
    "Zeytin, sarı kapaklı kavanozdakiyle aynıdır; jelatin koruma nedeniyle kavanoz başına ₺150,00 daha fazladır."
  );
});

test("sarı kapak: jelatin yok; zeytin aynı, jelatin olmadığı için kavanoz başına ₺150 daha uygun", () => {
  const e = variantExplanation(sari, both);
  assert.equal(e?.note, "Kapağın altında jelatin koruma yoktur.");
  assert.equal(
    e?.compare,
    "Zeytin, siyah kapaklı kavanozdakiyle aynıdır; jelatin koruma olmadığı için kavanoz başına ₺150,00 daha uygundur."
  );
});

test("fark fiyattan hesaplanır; eşit fiyatta fark yazılmaz; ters fiyatta gerekçe uydurulmaz", () => {
  // Panelden fiyat değişirse (ör. indirim) metin yeni farkı yazar
  assert.match(variantExplanation({ ...siyah, priceKurus: 32_000 }, [{ ...siyah, priceKurus: 32_000 }, sari])!.compare, /₺120,00 daha fazladır/);
  assert.equal(
    variantExplanation(siyah, [siyah, { ...sari, priceKurus: 35_000 }])?.compare,
    "Zeytin, sarı kapaklı kavanozdakiyle aynıdır."
  );
  const reversed = variantExplanation({ ...sari, priceKurus: 40_000 }, [siyah, { ...sari, priceKurus: 40_000 }])!;
  assert.equal(reversed.compare, "Zeytin, siyah kapaklı kavanozdakiyle aynıdır; kavanoz başına ₺50,00 daha fazladır.");
  // Diğer seçenek yoksa yalnız bilgi
  assert.equal(variantExplanation(siyah, [siyah])?.compare, "Zeytin, sarı kapaklı kavanozdakiyle aynıdır.");
});

test("tanımsız seçenek (diğer ürünler): açıklama yok", () => {
  assert.equal(variantExplanation({ sku: "GMZ-1KG", priceKurus: 50_000 }, [{ sku: "GMZ-1KG", priceKurus: 50_000 }]), null);
  assert.equal(variantExplanation({ sku: null, priceKurus: 50_000 }, []), null);
  assert.equal(variantExplanation({ sku: "constructor", priceKurus: 1 }, []), null);
});
