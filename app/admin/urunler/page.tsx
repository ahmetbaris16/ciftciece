/**
 * Admin — Ürün Listesi
 */

import { requireAdmin } from "@/lib/auth/session";
import { getProductsForAdmin } from "@/lib/repositories";
import { getCategoriesForAdmin } from "@/lib/repositories";
import AdminShell from "@/components/admin/AdminShell";
import Link from "next/link";
import { formatPrice } from "@/types";

export default async function AdminUrunlerPage() {
  const user = await requireAdmin();
  const [products, categories] = await Promise.all([
    getProductsForAdmin(),
    getCategoriesForAdmin(),
  ]);

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <AdminShell user={user} activeSection="urunler">
      <div style={{ padding: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#e8e4d9", margin: 0 }}>
              Ürünler
            </h1>
            <p style={{ fontSize: "0.875rem", color: "rgba(232,228,217,0.5)", margin: "0.25rem 0 0" }}>
              {products.length} ürün
            </p>
          </div>
          <Link
            href="/admin/urunler/yeni"
            style={{
              padding: "0.625rem 1.25rem",
              background: "linear-gradient(135deg, #6b7a3d 0%, #8fa34e 100%)",
              borderRadius: "8px",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            + Yeni Ürün
          </Link>
        </div>

        {/* Tablo */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Ürün", "Kategori", "Fiyat", "Stok", "Durum", ""].map((h) => (
                  <th key={h} style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "rgba(232,228,217,0.4)", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const firstVariant = product.variants[0];
                const totalStock = product.variants.reduce((sum, v) => sum + (v.stockQuantity ?? 0), 0);
                const lowStock = totalStock < 10;

                return (
                  <tr key={product.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "0.75rem" }}>
                      <Link
                        href={`/admin/urunler/${product.id}`}
                        style={{ color: "#e8e4d9", textDecoration: "none", fontWeight: 500, fontSize: "0.9375rem" }}
                      >
                        {product.name}
                      </Link>
                    </td>
                    <td style={{ padding: "0.75rem", fontSize: "0.875rem", color: "rgba(232,228,217,0.6)" }}>
                      {categoryMap.get(product.categoryId) ?? "—"}
                    </td>
                    <td style={{ padding: "0.75rem", fontSize: "0.875rem", color: "#e8e4d9" }}>
                      {firstVariant ? formatPrice(firstVariant.priceKurus) : "—"}
                      {product.variants.length > 1 && (
                        <span style={{ fontSize: "0.75rem", color: "rgba(232,228,217,0.4)", marginLeft: "0.25rem" }}>
                          +{product.variants.length - 1}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      <span style={{
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        color: lowStock ? "#fca5a5" : "rgba(232,228,217,0.6)",
                      }}>
                        {totalStock}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "0.125rem 0.5rem",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        background: product.isPublished ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.15)",
                        color: product.isPublished ? "#4ade80" : "#facc15",
                      }}>
                        {product.isPublished ? "Yayında" : "Taslak"}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem", textAlign: "right" }}>
                      <Link
                        href={`/admin/urunler/${product.id}`}
                        style={{ color: "#8fa34e", fontSize: "0.8125rem", textDecoration: "none" }}
                      >
                        Düzenle →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
