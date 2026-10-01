/**
 * iyzico HPP webhook'unu (X-IYZ-SIGNATURE-V3 imzalı) yerel sunucuya gönderir — uç noktanın
 * imza doğrulaması, gelen kutusu ve tekrar korumasını gerçek HTTP üzerinden denemek için.
 *
 *   npx tsx scripts/iyzico-webhook-sim.ts --attempt <denemeId> [--status SUCCESS] [--twice]
 *   npx tsx scripts/iyzico-webhook-sim.ts --token <token> --conversation <id> --payment-id <no> [--status FAILURE]
 *
 * Seçenekler:
 *   --attempt <id>        token/conversationId/ödeme no veritabanındaki denemeden okunur (DATABASE_URL)
 *   --status <durum>      SUCCESS (varsayılan) | FAILURE | INIT_THREEDS ...
 *   --event-type <tür>    varsayılan CHECKOUT_FORM_AUTH
 *   --url <adres>         varsayılan http://localhost:3000/api/payment/webhook/iyzico (yalnız yerel adres)
 *   --bad-signature       imzayı bozar (reddedilmeli: 401)
 *   --twice               aynı bildirimi iki kez gönderir (ikincisi duplicate:true olmalı)
 *
 * İmza IYZICO_SECRET_KEY ile (.env) dokümandaki formülle hesaplanır:
 *   HMAC-SHA256(secretKey, secretKey + iyziEventType + iyziPaymentId + token + paymentConversationId + status)
 * Bu betik iyzico'nun kendisini taklit eder; gerçek iyzico bildiriminin biçimini kanıtlamaz
 * (sandbox denemesi: docs/IYZICO_SANDBOX_TEST.md).
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { iyzicoWebhookSignature, IYZICO_SIGNATURE_HEADER } from "../lib/payment/webhook/iyzico";

const root = path.resolve(__dirname, "..");
if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const secretKey = process.env.IYZICO_SECRET_KEY?.trim();
  if (!secretKey || /todo|xxx|your/i.test(secretKey)) throw new Error("IYZICO_SECRET_KEY tanımlı değil (.env).");

  const url = new URL(arg("url") ?? "http://localhost:3000/api/payment/webhook/iyzico");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Yalnız yerel adrese gönderilir (yanlışlıkla canlı siteye sahte bildirim gitmesin).");
  }

  let token = arg("token");
  let conversationId = arg("conversation");
  let paymentId = arg("payment-id");
  const attemptId = arg("attempt");
  if (attemptId) {
    const prisma = new PrismaClient();
    try {
      const attempt = await prisma.paymentAttempt.findUnique({ where: { id: attemptId } });
      if (!attempt?.providerToken) throw new Error(`Deneme bulunamadı ya da token'ı yok: ${attemptId}`);
      token = attempt.providerToken;
      conversationId = attempt.conversationId ?? attempt.id;
      paymentId = paymentId ?? attempt.providerPaymentId ?? undefined;
    } finally {
      await prisma.$disconnect();
    }
  }
  if (!token || !conversationId) throw new Error("--attempt ya da --token ve --conversation gerekli.");

  const payload = {
    paymentConversationId: conversationId,
    merchantId: "0",
    token,
    status: arg("status") ?? "SUCCESS",
    iyziReferenceCode: `sim-${Date.now()}`,
    iyziEventType: arg("event-type") ?? "CHECKOUT_FORM_AUTH",
    iyziEventTime: Date.now(),
    iyziPaymentId: paymentId ?? "0",
  };
  // iyzico dokümanında iyziPaymentId ve iyziEventTime sayıdır; imzaya metin hâli girer
  const body = JSON.stringify({ ...payload, iyziPaymentId: Number(payload.iyziPaymentId) || payload.iyziPaymentId });
  let signature = iyzicoWebhookSignature(secretKey, { ...payload, iyziEventTime: String(payload.iyziEventTime) });
  if (flag("bad-signature")) signature = signature.replace(/^./, (c) => (c === "0" ? "1" : "0"));

  for (let i = 0; i < (flag("twice") ? 2 : 1); i++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", [IYZICO_SIGNATURE_HEADER]: signature },
      body,
    });
    console.log(`${i + 1}. gönderim → HTTP ${res.status} ${await res.text()}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
