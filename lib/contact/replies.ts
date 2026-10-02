/**
 * İletişim mesajına yönetim panelinden yanıt. Yanıtlar ayrı tabloda tutulmaz: yanıt e-postası (email_messages)
 * mesaja anahtarıyla bağlanır — contact-reply:<mesaj id>:<nonce>. Aynı nonce ikinci e-posta oluşturmaz.
 */

import { prisma } from "@/lib/db/prisma";
import { getBusinessInfo } from "@/lib/business/business.repository";
import { contactReplyEmail } from "@/lib/email/templates/contact";
import { replyToFor } from "@/lib/email/brand";
import { enqueueEmail } from "@/lib/notifications/queue";

export const contactReplyKeyPrefix = (messageId: string) => `contact-reply:${messageId}:`;

/** Yanıtı kuyruğa ekler ve mesajı "yanıtlandı" yapar. Mesaj yoksa null; aynı nonce ile tekrar: { queued: false } */
export async function replyToContactMessage(messageId: string, reply: string, nonce: string): Promise<{ queued: boolean } | null> {
  const msg = await prisma.contactMessage.findUnique({ where: { id: messageId } });
  if (!msg) return null;
  const business = await getBusinessInfo();
  const mail = contactReplyEmail({
    business,
    name: msg.name,
    subjectLine: msg.subject,
    reply,
    original: msg.message,
    receivedAt: new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(msg.createdAt),
  });
  const queued = await prisma.$transaction(async (tx) => {
    const isNew = await enqueueEmail(tx, {
      kind: "CONTACT_REPLY",
      dedupeKey: `${contactReplyKeyPrefix(messageId)}${nonce}`,
      audience: "customer",
      to: msg.email,
      replyTo: replyToFor(business),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    if (isNew) await tx.contactMessage.update({ where: { id: messageId }, data: { status: "ANSWERED" } });
    return isNew;
  });
  return { queued };
}
