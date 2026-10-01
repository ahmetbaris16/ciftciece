import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Görsel optimizasyonu
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75, 80, 85],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "maps.googleapis.com",
      },
    ],
    // Orijinal büyük fotoğrafları responsive olarak sun
    deviceSizes: [390, 430, 768, 1024, 1280, 1440, 1920],
    imageSizes: [64, 128, 256, 384, 512],
  },

  // Security headers
  async headers() {
    const isDev = process.env.NODE_ENV === "development";

    const headers = [
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "X-Frame-Options",
        value: "SAMEORIGIN",
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(self)",
      },
    ];

    // HSTS sadece production'da (dev'de HTTPS yok)
    if (!isDev) {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    // CSP — geliştirme aşamasında daha gevşek
    const csp = isDev
      ? [
          "default-src 'self'",
          "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "font-src 'self'",
          "frame-src https://www.google.com/maps/ https://maps.google.com/",
          "connect-src 'self' ws: wss:",
        ].join("; ")
      : [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' https://static.iyzipay.com https://maps.googleapis.com",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "font-src 'self'",
          "frame-src https://www.google.com/maps/ https://maps.google.com/",
          "connect-src 'self' https://api.iyzipay.com https://sandbox-api.iyzipay.com",
        ].join("; ");

    headers.push({
      key: "Content-Security-Policy",
      value: csp,
    });

    return [
      {
        source: "/(.*)",
        headers,
      },
    ];
  },

  // Experimental features
  experimental: {
    optimizeCss: true,
  },
};

export default nextConfig;
