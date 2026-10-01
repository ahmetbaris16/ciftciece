import type { MetadataRoute } from "next";
import { STORE } from "@/lib/config/store";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${STORE.name} — Zeytin, Zeytinyağı ve Yöresel Ürünler`,
    short_name: STORE.name,
    description: STORE.seo.defaultDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#f5f1e8",
    theme_color: "#0f0f0f",
    lang: "tr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
