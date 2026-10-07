/**
 * Paneldeki stok alanı: yönetici alanı boşaltıp istediği sayıyı yazabilir; boş = 0, geçersiz giriş sessizce
 * başka bir sayıya dönmez.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStockInput } from "@/lib/catalog/stock-input";

test("stok metni → adet: boş 0, binlik nokta, geçersiz giriş null", () => {
  assert.equal(parseStockInput(""), 0);
  assert.equal(parseStockInput("   "), 0);
  assert.equal(parseStockInput("0"), 0);
  assert.equal(parseStockInput("25"), 25);
  assert.equal(parseStockInput(" 140 "), 140);
  assert.equal(parseStockInput("007"), 7);
  assert.equal(parseStockInput("1.000"), 1000);
  assert.equal(parseStockInput("12.500"), 12500);
  assert.equal(parseStockInput("9999999"), 9999999);
  for (const bad of ["-3", "2,5", "2.5", "1.00", "on", "10a", "12345678", "1e3"]) {
    assert.equal(parseStockInput(bad), null, bad);
  }
});
