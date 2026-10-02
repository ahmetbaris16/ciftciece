/**
 * POST /api/admin/messages/[id]/reply { message, nonce } — iletişim mesajını işletmenin e-posta adresinden
 * yanıtlar (lib/contact/replies.ts). Yanıt kuyruktan gider (hata olursa yeniden denenir); mesaj "yanıtlandı" olur.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminAction, AdminActionError } from "@/lib/admin/api";
import { replyToContactMessage } from "@/lib/contact/replies";
import { createAuditLog } from "@/lib/security/audit";
import { scheduleNotifications } from "@/lib/notifications/run";

const Schema = z.object({
  message: z.string().trim().min(5, { error: "Yanıt çok kısa." }).max(5000, { error: "Yanıt en fazla 5000 karakter." }),
  nonce: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return adminAction(request, Schema, async (input, user) => {
    const result = await replyToContactMessage(id, input.message, input.nonce);
    if (!result) throw new AdminActionError("Mesaj bulunamadı.", 404);
    if (result.queued) {
      await createAuditLog({ userId: user.id, action: "contact.reply", entity: "contact_message", entityId: id, details: {} });
      scheduleNotifications();
    }
    return result;
  });
}
