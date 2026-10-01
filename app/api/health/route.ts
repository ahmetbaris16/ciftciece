/**
 * GET /api/health — sitenin ve veritabanının durumu (yayın sonrası kontrol, izleme).
 *
 * Veritabanına basit bir sorgu atar ve canlı veritabanının bu uygulamanın beklediği ayarlarda olup
 * olmadığını bildirir:
 *  - strictMode: sığmayan veri kesilip yazılmasın, hata versin (MariaDB katı modu; kapalıysa uzun metin
 *    sessizce kısalabilir),
 *  - utf8mb4: Türkçe karakter ve emoji eksiksiz saklansın,
 *  - readCommittedSafe: ödeme/stok işlemleri READ COMMITTED açılır (lib/db/prisma.ts). İkili günlük
 *    (binlog) açık ve biçimi STATEMENT ise MariaDB bu işlemlerde yazmayı reddeder — sipariş alınamaz.
 *    Varsayılan biçim (MIXED/ROW) sorunsuz.
 * Sürüm, kullanıcı adı gibi ayrıntı vermez. Veritabanına ulaşılamazsa 503.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!USE_DB) {
    return NextResponse.json({ status: "error", db: "not_configured" }, { status: 503 });
  }
  const started = Date.now();
  try {
    const rows = await prisma.$queryRaw<Array<{ sqlMode: string; charset: string; logBin: number | bigint; binlogFormat: string }>>`
      SELECT @@SESSION.sql_mode AS sqlMode, @@character_set_database AS charset,
             @@log_bin AS logBin, @@SESSION.binlog_format AS binlogFormat`;
    const row = rows[0];
    const sqlMode = row?.sqlMode ?? "";
    const checks = {
      strictMode: /STRICT_(TRANS|ALL)_TABLES/.test(sqlMode),
      utf8mb4: row?.charset === "utf8mb4",
      readCommittedSafe: !(Number(row?.logBin ?? 0) === 1 && row?.binlogFormat === "STATEMENT"),
    };
    const ok = checks.strictMode && checks.utf8mb4 && checks.readCommittedSafe;
    return NextResponse.json(
      { status: ok ? "ok" : "degraded", db: "ok", latencyMs: Date.now() - started, checks },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[health] veritabanına ulaşılamadı:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { status: "error", db: "down" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
