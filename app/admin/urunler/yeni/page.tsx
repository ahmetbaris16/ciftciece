/**
 * Admin — Yeni Ürün Oluşturma
 */

import { requireAdmin } from "@/lib/auth/session";
import { getCategoriesForAdmin } from "@/lib/repositories";
import AdminShell from "@/components/admin/AdminShell";
import ProductCreateForm from "@/components/admin/ProductCreateForm";

export default async function AdminYeniUrun() {
  const user = await requireAdmin();
  const categories = await getCategoriesForAdmin();

  return (
    <AdminShell user={user} activeSection="urunler">
      <div style={{ padding: "2rem", maxWidth: "900px" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#e8e4d9", margin: "0 0 1.5rem" }}>
          Yeni Ürün
        </h1>
        <ProductCreateForm categories={categories} />
      </div>
    </AdminShell>
  );
}
