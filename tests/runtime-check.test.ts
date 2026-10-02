/**
 * Yayın ortamı ayar denetimi (Y-03, R-13): eksik/tehlikeli ayarla production sunucusu açılmaz.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkProductionConfig, type EnvVars } from "@/lib/config/runtime-check";

const GOOD: EnvVars = {
  DATABASE_URL: "mysql://u:p@localhost:3306/ciftciece",
  NEXTAUTH_SECRET: "q7Vb0nR4yW2kX9tL1mZ8cE5hJ3sA6dG0pF2uI4oK7eQ=",
  NEXTAUTH_URL: "https://ciftciece.com",
  NEXT_PUBLIC_APP_URL: "https://ciftciece.com",
  PAYMENT_PROVIDER: "iyzico",
  IYZICO_API_KEY: "sandbox-abc",
  IYZICO_SECRET_KEY: "sandbox-def",
  IYZICO_BASE_URL: "https://api.iyzipay.com",
};

const errorsOf = (env: EnvVars) => checkProductionConfig(env).errors;

test("doğru yapılandırma: hata yok", () => {
  assert.deepEqual(errorsOf(GOOD), []);
});

test("oturum anahtarı eksik, kısa ya da yer tutucu: açılmaz", () => {
  assert.equal(errorsOf({ ...GOOD, NEXTAUTH_SECRET: undefined }).length, 1);
  assert.equal(errorsOf({ ...GOOD, NEXTAUTH_SECRET: "kisa-anahtar" }).length, 1);
  assert.equal(errorsOf({ ...GOOD, NEXTAUTH_SECRET: "TODO_MINIMUM_32_KARAKTER_RANDOM_STRING" }).length, 1);
});

test("veritabanı adresi eksik ya da MySQL değil: açılmaz", () => {
  assert.equal(errorsOf({ ...GOOD, DATABASE_URL: "" }).length, 1);
  assert.equal(errorsOf({ ...GOOD, DATABASE_URL: "postgresql://u:p@h/db" }).length, 1);
});

test("site adresi: eksik, localhost, http ya da iki adres farklıysa açılmaz", () => {
  assert.ok(errorsOf({ ...GOOD, NEXT_PUBLIC_APP_URL: undefined }).length >= 1);
  assert.ok(errorsOf({ ...GOOD, NEXT_PUBLIC_APP_URL: "http://localhost:3000", NEXTAUTH_URL: "http://localhost:3000" }).length >= 1);
  assert.ok(errorsOf({ ...GOOD, NEXT_PUBLIC_APP_URL: "http://ciftciece.com", NEXTAUTH_URL: "http://ciftciece.com" }).length >= 1);
  assert.ok(errorsOf({ ...GOOD, NEXTAUTH_URL: "https://www.ciftciece.com" }).length >= 1);
});

test("test ödeme sağlayıcısı (stub) canlıda açılamaz; yalnız yerel production denemesinde", () => {
  assert.ok(errorsOf({ ...GOOD, ALLOW_STUB_PAYMENTS: "true" }).length >= 1);
  const local = {
    ...GOOD,
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3200",
    NEXTAUTH_URL: "http://127.0.0.1:3200",
    LOCAL_PRODUCTION_TEST: "1",
    ALLOW_STUB_PAYMENTS: "true",
  };
  assert.deepEqual(errorsOf(local), []);
});

test("ödeme sağlayıcısı tanımsız: kart DEMO kipinde (uyarı); stub canlıda açılmaz", () => {
  const noProvider: EnvVars = { ...GOOD, PAYMENT_PROVIDER: undefined };
  const r = checkProductionConfig(noProvider);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => w.includes("DEMO")));
  assert.ok(errorsOf({ ...GOOD, PAYMENT_PROVIDER: "stub" }).some((e) => e.includes("stub")));
});

test("iyzico adresi yalnız resmi canlı/test adresi olabilir; anahtar yoksa yalnız uyarı", () => {
  assert.equal(errorsOf({ ...GOOD, IYZICO_BASE_URL: "https://iyzico.example.com" }).length, 1);
  const r = checkProductionConfig({ ...GOOD, IYZICO_API_KEY: "TODO" });
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => w.includes("anahtar")));
});

test("Akbank: anahtarsız demo uyarısı; geçersiz ortam ve canlıda test adresi hata", () => {
  const ak = { ...GOOD, PAYMENT_PROVIDER: "akbank" };
  const demo = checkProductionConfig(ak);
  assert.deepEqual(demo.errors, []);
  assert.ok(demo.warnings.some((w) => w.includes("Akbank bilgileri")));
  const withKeys = { ...ak, AKBANK_MERCHANT_SAFE_ID: "M1", AKBANK_TERMINAL_SAFE_ID: "T1", AKBANK_SECRET_KEY: "s".repeat(32) };
  const testEnv = checkProductionConfig(withKeys);
  assert.deepEqual(testEnv.errors, []);
  assert.ok(testEnv.warnings.some((w) => w.includes("TEST ortamı")));
  assert.deepEqual(checkProductionConfig({ ...withKeys, AKBANK_ENV: "prod" }).errors, []);
  assert.ok(errorsOf({ ...withKeys, AKBANK_ENV: "canli" }).some((e) => e.includes("AKBANK_ENV")));
  assert.ok(errorsOf({ ...withKeys, AKBANK_API_URL: "http://127.0.0.1:3299" }).some((e) => e.includes("AKBANK_API_URL")));
});
