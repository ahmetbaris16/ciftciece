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
import Link from "next/link";
import { getActiveDiscountsByProduct } from "@/lib/repositories/discount.repository";
import { formatDiscountPeriod } from "@/lib/pricing/discount";
import { formatPrice } from "@/types";

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
  const discount = (await getActiveDiscountsByProduct([product.id]).catch(() => new Map())).get(product.id);

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
        {discount && (
          <p style={{ margin: "0 0 1rem", padding: "0.75rem 1rem", borderRadius: 10, background: "rgba(240,120,100,0.1)", color: "#f3c2b8", fontSize: "0.875rem", lineHeight: 1.6 }}>
            Bu üründe %{discount.percent} indirim sürüyor ({formatDiscountPeriod(discount.startsAt.toISOString(), discount.endsAt.toISOString())}):{" "}
            {product.variants
              .filter((v) => discount.items.has(v.id))
              .map((v) => `${v.name} ${formatPrice(discount.items.get(v.id)!.referenceKurus)} → ${formatPrice(discount.items.get(v.id)!.saleKurus)}`)
              .join(" · ")}
            . Aşağıdaki fiyat indirimsiz liste fiyatıdır; değiştirirseniz süren indirimin fiyatı değişmez.{" "}
            <Link href="/admin/indirimler" style={{ color: "#f3a08f" }}>
              İndirimi yönet
            </Link>
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
