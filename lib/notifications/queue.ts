/**
 * E-posta kuyruğuna ekleme (email_messages). Tekrar korumalı: aynı dedupeKey ikinci kez eklenmez.
 * İşlem (transaction) içinde ya da dışında çağrılabilir.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

export type EmailAudience = "customer" | "store";

export interface EmailDraft {
  kind: string;
  dedupeKey: string;
  orderId?: string | null;
  audience: EmailAudience;
  to: string;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  availableAt?: Date;
  expiresAt?: Date | null;
}

const MAX_KEY = 191;

/** Yeni eklendiyse true; aynı anahtarla zaten varsa false */
export async function enqueueEmail(db: Db, draft: EmailDraft): Promise<boolean> {
  const dedupeKey = draft.dedupeKey.slice(0, MAX_KEY);
  const existing = await db.emailMessage.findUnique({ where: { dedupeKey }, select: { id: true } });
  if (existing) return false;
  try {
    await db.emailMessage.create({
      data: {
        kind: draft.kind,
        dedupeKey,
        orderId: draft.orderId ?? null,
        audience: draft.audience,
        toAddress: draft.to.trim().toLowerCase(),
        replyTo: draft.replyTo ?? null,
        subject: draft.subject.slice(0, 300),
        html: draft.html,
        text: draft.text,
        availableAt: draft.availableAt ?? new Date(),
        expiresAt: draft.expiresAt ?? null,
      },
    });
    return true;
  } catch (err) {
    // Eşzamanlı ekleme: UNIQUE ihlali "zaten var" demektir
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
}
