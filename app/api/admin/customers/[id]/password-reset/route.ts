/**
 * POST /api/admin/customers/[id]/password-reset — üyenin e-postasına şifre yenileme bağlantısı gönderir (müşteri
 * giriş yapamadığında). Yönetici şifreyi ve bağlantıyı görmez; yeni şifreyi müşteri belirler.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminAction } from "@/lib/admin/api";
import { sendResetLinkToCustomer } from "@/lib/admin/customer-actions";
import { resetLinkOrigin } from "@/lib/account/password-reset";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return adminAction(request, z.object({}), (_input, user) => sendResetLinkToCustomer(id, user.id, resetLinkOrigin(request.url)));
}
