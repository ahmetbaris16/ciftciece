/**
 * Admin'in yazdığı TL tutarının kuruşa çevrilmesi (iade formu): Türkçe biçim, binlik ayırıcı, geçersiz girdi.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTlInput } from "@/lib/payment/money";

test("TL girdisi kuruşa doğru çevrilir", () => {
  const cases: Array<[string, number | null]> = [
    ["239", 23_900],
    ["239,9", 23_990],
    ["239,90", 23_990],
    ["239.90", 23_990],
    ["1.234,50", 123_450],
    ["1.234", 123_400],
    ["12.345.678,01", 1_234_567_801],
    ["₺ 250", 25_000],
    ["250 TL", 25_000],
    ["0,01", 1],
    ["250,", 25_000],
    ["", null],
    ["abc", null],
    ["-5", null],
    ["1,234,5", null],
    ["2,345", null],
    ["1e3", null],
  ];
  for (const [input, expected] of cases) assert.equal(parseTlInput(input), expected, `girdi: "${input}"`);
});
