"use client";

export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="no-print" style={{ padding: "0.5rem 1rem", borderRadius: 6, border: "1px solid #999", background: "#fff", font: "inherit", cursor: "pointer" }}>
      Yazdır
    </button>
  );
}
