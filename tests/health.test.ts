/**
 * /api/health: veritabanı durumu ve canlıda beklenen ayarlar (katı mod, utf8mb4).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "@/app/api/health/route";
import { setupTestDb } from "./helpers/db";

setupTestDb();

test("veritabanı ayakta ve ayarlar doğruysa ok", async () => {
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "ok");
  assert.equal(body.db, "ok");
  assert.deepEqual(body.checks, { strictMode: true, utf8mb4: true });
  assert.equal(res.headers.get("cache-control"), "no-store");
});
