/**
 * Admin — Ürün Düzenleme
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getProductByIdForAdmin } from "@/lib/repositories";
import { getCategoriesForAdmin } from "@/lib/repositories";
import AdminShell from "@/components/admin/AdminShell";
import ProductEditForm from "@/components/admin/ProductEditForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminUrunDuzenle({ params }: Props) {
  const user = await requireAdmin();
  const { id } = await params;
  
  const [product, categories] = await Promise.all([
    getProductByIdForAdmin(id),
    getCategoriesForAdmin(),
  ]);

  if (!product) {
    notFound();
  }

  return (
    <AdminShell user={user} activeSection="urunler">
      <div style={{ padding: "2rem", maxWidth: "900px" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#e8e4d9", margin: "0 0 1.5rem" }}>
          {product.name}
        </h1>
        <ProductEditForm product={product} categories={categories} />
      </div>
    </AdminShell>
  );
}
