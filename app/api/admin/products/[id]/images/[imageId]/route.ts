/**
 * PATCH  /api/admin/products/[id]/images/[imageId] { altText?, makePrimary? } — açıklama / kapak fotoğrafı
 * DELETE /api/admin/products/[id]/images/[imageId] — fotoğrafı üründen kaldırır
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminAction, AdminActionError } from "@/lib/admin/api";
import { removeProductImage, updateProductImage } from "@/lib/images/product-images";
import { createAuditLog } from "@/lib/security/audit";
import { revalidateStorefront } from "@/lib/cache/revalidate";

type Ctx = { params: Promise<{ id: string; imageId: string }> };

const PatchSchema = z.object({
  altText: z.string().trim().max(500).nullable().optional(),
  makePrimary: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, context: Ctx) {
  const { id, imageId } = await context.params;
  return adminAction(request, PatchSchema, async (input) => {
    if (!(await updateProductImage(id, imageId, input))) throw new AdminActionError("Fotoğraf bulunamadı.", 404);
    revalidateStorefront();
  });
}

export async function DELETE(request: NextRequest, context: Ctx) {
  const { id, imageId } = await context.params;
  return adminAction(request, z.unknown(), async (_input, user) => {
    if (!(await removeProductImage(id, imageId))) throw new AdminActionError("Fotoğraf bulunamadı.", 404);
    await createAuditLog({ userId: user.id, action: "product.image_removed", entity: "product", entityId: id, details: { imageId } });
    revalidateStorefront();
  });
}
