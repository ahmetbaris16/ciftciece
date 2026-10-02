/**
 * POST /api/admin/emails/run — bildirim döngüsünü hemen çalıştırır: bekleyen olaylar e-postaya çevrilir,
 * sırası gelen e-postalar gönderilir (zamanlanmış işi beklemeden).
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminAction } from "@/lib/admin/api";
import { runNotifications } from "@/lib/notifications/run";

export async function POST(request: NextRequest) {
  return adminAction(request, z.unknown(), async () => runNotifications());
}
