/**
 * Admin — Ürün Düzenleme
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getProductByIdForAdmin } from "@/lib/repositories";
import { getCategoriesForAdmin } from "@/lib/repositories";
import AdminShell from "@/components/admin/AdminShell";
import ProductEditForm from "@/components/admin/ProductEditForm";
import ProductImagesManager from "@/components/admin/ProductImagesManager";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ yeni?: string }>;
}

export default async function AdminUrunDuzenle({ params, searchParams }: Props) {
  const user = await requireAdmin();
  const { id } = await params;
  const { yeni } = await searchParams;
  
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
        {yeni && (
          <p style={{ margin: "0 0 1rem", padding: "0.75rem 1rem", borderRadius: 10, background: "rgba(159,211,159,0.1)", color: "#9fd39f", fontSize: "0.875rem" }}>
            Ürün oluşturuldu. Şimdi fotoğraflarını ekleyin.
          </p>
        )}
        <ProductImagesManager
          productId={product.id}
          productName={product.name}
          images={product.images.map((i) => ({ id: i.id, url: i.url, altText: i.altText ?? null }))}
        />
        <ProductEditForm product={product} categories={categories} />
      </div>
    </AdminShell>
  );
}
