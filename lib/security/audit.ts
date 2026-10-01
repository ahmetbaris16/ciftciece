/**
 * Çiftçi Ece — Audit Log Helper
 *
 * Admin işlemlerini kayıt altına alır.
 */

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

const USE_DB = !!process.env.DATABASE_URL;

interface AuditEntry {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

/**
 * Audit log kaydı oluşturur.
 * DB yoksa console'a yazar (development).
 */
export async function createAuditLog(entry: AuditEntry): Promise<void> {
  if (!USE_DB) {
    console.log("[AUDIT]", JSON.stringify(entry));
    return;
  }

  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        details: (entry.details ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress: entry.ipAddress,
      },
    });
  } catch (err) {
    // Audit log hatası ana işlemi durdurmamalı
    console.error("[AUDIT] Failed to create log:", err);
  }
}
