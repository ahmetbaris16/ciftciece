"use client";

import dynamic from "next/dynamic";

const StoreMap = dynamic(
  () => import("@/components/home/StoreMap"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "var(--color-bg-soft)",
          borderRadius: "16px",
        }}
      />
    ),
  }
);

export default function MagazaMap() {
  return <StoreMap />;
}
