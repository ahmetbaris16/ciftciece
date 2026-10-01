/**
 * Admin Giriş Sayfası
 *
 * Suspense boundary ile sarılmış login formu.
 */

import { Suspense } from "react";
import AdminLoginForm from "@/components/admin/AdminLoginForm";

export default function AdminGirisPage() {
  return (
    <div style={pageStyles.page}>
      <div style={pageStyles.card}>
        <div style={pageStyles.header}>
          <div style={pageStyles.logo}>🫒</div>
          <h1 style={pageStyles.title}>Çiftçi Ece</h1>
          <p style={pageStyles.subtitle}>Yönetim Paneli</p>
        </div>

        <Suspense fallback={<div style={{ color: "rgba(232,228,217,0.5)", textAlign: "center", padding: "2rem" }}>Yükleniyor...</div>}>
          <AdminLoginForm />
        </Suspense>
      </div>
    </div>
  );
}

const pageStyles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #1a1f16 0%, #2d3426 50%, #1a1f16 100%)",
    padding: "1rem",
  },
  card: {
    width: "100%",
    maxWidth: "400px",
    background: "rgba(255,255,255,0.05)",
    backdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "16px",
    padding: "2.5rem 2rem",
  },
  header: {
    textAlign: "center" as const,
    marginBottom: "2rem",
  },
  logo: {
    fontSize: "2.5rem",
    marginBottom: "0.5rem",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "#e8e4d9",
    margin: 0,
    fontFamily: "'Inter', sans-serif",
  },
  subtitle: {
    fontSize: "0.875rem",
    color: "rgba(232,228,217,0.5)",
    margin: "0.25rem 0 0",
  },
};
