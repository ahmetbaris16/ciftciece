/**
 * GET|POST /api/cron/run — zamanlanmış işler (süresi dolan siparişler, e-posta kuyruğu).
 *
 * Hostinger uygulamayı yalnız trafik varken çalıştırır; bu adres hPanel → Cron Jobs ile 5 dakikada bir
 * çağrılır (komut docs/YAYIN.md'de). Gizli anahtar (CRON_SECRET, en az 24 karakter) ister:
 *   Authorization: Bearer <CRON_SECRET>   (önerilen)   ya da   ?key=<CRON_SECRET>
 * Yanıtta kişisel veri yok (yalnız sayılar ve süreler).
 */

import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runCronJobs } from "@/lib/cron/jobs";
import { USE_DB } from "@/lib/data/source";

export const dynamic = "force-dynamic";

const MIN_SECRET_LENGTH = 24;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function providedKey(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return request.nextUrl.searchParams.get("key");
}

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    return NextResponse.json({ error: "CRON_SECRET ayarlı değil (en az 24 karakter)." }, { status: 503 });
  }
  const key = providedKey(request);
  if (!key || !safeEqual(key, secret)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  if (!USE_DB) return NextResponse.json({ error: "Veritabanı yok" }, { status: 503 });

  const started = Date.now();
  const jobs = await runCronJobs();
  const ok = jobs.every((j) => j.ok);
  return NextResponse.json(
    { ok, ms: Date.now() - started, jobs },
    { status: ok ? 200 : 500, headers: { "Cache-Control": "no-store" } }
  );
}

export const GET = handle;
export const POST = handle;
