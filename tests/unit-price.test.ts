/**
 * Birim fiyat: varyant adından net miktar (kg/g/L/ml), kavanoz hacmi okunmaz, kuruşa yarım yukarı yuvarlama.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNetQuantity, unitPrice } from "@/lib/catalog/unit-price";

test("net miktar varyant adından okunur", () => {
  const cases: Array<[string, { amount: number; unit: "g" | "ml" } | null]> = [
    ["1 kg", { amount: 1000, unit: "g" }],
    ["500 g", { amount: 500, unit: "g" }],
    ["400 gr", { amount: 400, unit: "g" }],
    ["1,5 kg", { amount: 1500, unit: "g" }],
    ["1 L Cam", { amount: 1000, unit: "ml" }],
    ["5 L Teneke", { amount: 5000, unit: "ml" }],
    ["500 ml Sıkmalı Şişe", { amount: 500, unit: "ml" }],
    ["5 lt", { amount: 5000, unit: "ml" }],
    ["0,75 L", { amount: 750, unit: "ml" }],
    ["2 x 500 g", { amount: 1000, unit: "g" }],
    ["720 ml Kavanoz", null],
    ["Büyük boy", null],
    ["Lezzetli", null],
    ["1 Galon", null],
  ];
  for (const [name, expected] of cases) assert.deepEqual(parseNetQuantity(name), expected, name);
});

test("birim fiyat kg / L başına, kuruşa yuvarlanır", () => {
  assert.deepEqual(unitPrice(50_000, "1 kg"), { kurus: 50_000, per: "kg" });
  assert.deepEqual(unitPrice(28_900, "500 ml Sıkmalı Şişe"), { kurus: 57_800, per: "L" });
  assert.deepEqual(unitPrice(250_000, "5 L Teneke"), { kurus: 50_000, per: "L" });
  assert.deepEqual(unitPrice(12_999, "400 g"), { kurus: 32_498, per: "kg" }); // 32 497,5 → 32 498
  assert.equal(unitPrice(22_000, "720 ml Kavanoz"), null);
  assert.equal(unitPrice(0, "1 kg"), null);
});
