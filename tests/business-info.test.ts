/**
 * İşletme (satıcı) bilgileri: biçim denetimi, eksik alan listesi, kayıt/okuma.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BUSINESS_INFO,
  formatPhoneTr,
  isValidTckn,
  isValidVkn,
  missingBusinessFields,
  parseBusinessInfo,
  sellerLines,
  taxNumberWarning,
  validateBusinessInfo,
} from "@/lib/business/info";
import { getBusinessInfo, saveBusinessInfo } from "@/lib/business/business.repository";
import { setupTestDb } from "./helpers/db";

setupTestDb();

/** VKN'nin ilk 9 hanesinden kontrol hanesini üretir (algoritmayı bağımsız yazılmış hâliyle sınar) */
function vknWithCheckDigit(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const digit = Number(first9[i]);
    const tmp = (digit + 10 - (i + 1)) % 10;
    let v = (tmp * Math.pow(2, 10 - (i + 1))) % 9;
    if (tmp !== 0 && v === 0) v = 9;
    sum += v;
  }
  return first9 + String((10 - (sum % 10)) % 10);
}

test("T.C. kimlik ve vergi numarası kontrol haneleri", () => {
  assert.equal(isValidTckn("10000000146"), true);
  assert.equal(isValidTckn("10000000147"), false);
  assert.equal(isValidTckn("01234567890"), false, "0 ile başlayamaz");
  const vkn = vknWithCheckDigit("123456789");
  assert.equal(isValidVkn(vkn), true);
  const wrong = vkn.slice(0, 9) + String((Number(vkn[9]) + 1) % 10);
  assert.equal(isValidVkn(wrong), false);
  assert.equal(taxNumberWarning(vkn), null);
  assert.match(taxNumberWarning(wrong) ?? "", /kontrol hanesi/);
});

test("varsayılan bilgiler: adres ve telefon dolu, yasal kimlik eksik listelenir", () => {
  const info = parseBusinessInfo(null);
  assert.equal(info.address, DEFAULT_BUSINESS_INFO.address);
  assert.ok(info.phone.length >= 10);
  const missing = missingBusinessFields(info);
  assert.ok(missing.includes("İşletme türü"));
  assert.ok(missing.includes("Vergi numarası"));
  assert.ok(missing.includes("E-posta"));
  // Girilmemiş alan sözleşme satırlarında görünmez (uydurulmaz)
  const labels = sellerLines(info).map((l) => l.label);
  assert.ok(!labels.includes("Vergi kimlik no"));
  assert.ok(labels.includes("Adres"));
});

test("ayrıştırma: rakam dışı karakterler temizlenir, e-posta küçük harf, bozuk JSON varsayılana döner", () => {
  const info = parseBusinessInfo(
    JSON.stringify({ type: "COMPANY", taxNumber: "123 456 78 90", mersisNo: "0123-4567-8901-2345", email: "Bilgi@Ornek.COM" })
  );
  assert.equal(info.taxNumber, "1234567890");
  assert.equal(info.mersisNo, "0123456789012345");
  assert.equal(info.email, "bilgi@ornek.com");
  assert.deepEqual(parseBusinessInfo("{bozuk"), parseBusinessInfo(null));
  assert.equal(parseBusinessInfo(JSON.stringify({ type: "BAŞKA" })).type, "");
});

test("biçim denetimi", () => {
  const ok = { ...parseBusinessInfo(null), email: "bilgi@ornek.com", taxNumber: "1234567890" };
  assert.deepEqual(validateBusinessInfo(ok), []);
  assert.ok(validateBusinessInfo({ ...ok, taxNumber: "12345" }).length > 0);
  assert.ok(validateBusinessInfo({ ...ok, mersisNo: "123" }).length > 0);
  assert.ok(validateBusinessInfo({ ...ok, email: "bilgi@" }).length > 0);
  assert.ok(validateBusinessInfo({ ...ok, instagramUrl: "http://example.com" }).length > 0);
  assert.ok(validateBusinessInfo({ ...ok, whatsapp: "05326825372" }).length > 0, "WhatsApp ülke koduyla");
});

test("şirkette MERSİS zorunlu, şahıs işletmesinde değil", () => {
  const base = {
    ...parseBusinessInfo(null),
    legalName: "Örnek Gıda Ltd. Şti.",
    taxOffice: "Orhangazi",
    taxNumber: "1234567890",
    email: "bilgi@ornek.com",
  };
  assert.deepEqual(missingBusinessFields({ ...base, type: "COMPANY" }), ["MERSİS numarası"]);
  assert.deepEqual(missingBusinessFields({ ...base, type: "PERSON" }), []);
});

test("telefon gösterimi", () => {
  assert.equal(formatPhoneTr("05326825372"), "0532 682 53 72");
  assert.equal(formatPhoneTr("905326825372"), "0532 682 53 72");
  assert.equal(formatPhoneTr("5326825372"), "0532 682 53 72");
});

test("kaydet ve oku (site_settings)", async () => {
  const before = await getBusinessInfo();
  assert.equal(before.legalName, "");
  const info = {
    ...parseBusinessInfo(null),
    type: "PERSON" as const,
    legalName: "Ece Çiftçi",
    taxOffice: "Orhangazi",
    taxNumber: "10000000146",
    email: "bilgi@ornek.com",
  };
  await saveBusinessInfo(info);
  // getBusinessInfo istek başına önbellekli (React cache); test ortamında her çağrı yeni
  const after = await getBusinessInfo();
  assert.equal(after.legalName, "Ece Çiftçi");
  assert.equal(after.taxNumber, "10000000146");
  assert.deepEqual(missingBusinessFields(after), []);
  const labels = sellerLines(after).map((l) => `${l.label}: ${l.value}`);
  assert.ok(labels.includes("Satıcı (ad-soyad): Ece Çiftçi"));
  assert.ok(labels.includes("T.C. kimlik no: 10000000146"));
});
