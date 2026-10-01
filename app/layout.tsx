import type { Metadata, Viewport } from "next";
import { STORE } from "@/lib/config/store";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

// Fontlar build sırasında indirilip self-host edilir (harici istek yok, FOUT/CLS minimum).
// latin-ext: Türkçe karakterler (ğ, ş, ı, İ) için gerekli.
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter",
});

const playfair = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ),
  title: {
    default: STORE.seo.defaultTitle,
    template: STORE.seo.titleTemplate,
  },
  description: STORE.seo.defaultDescription,
  keywords: [...STORE.seo.keywords],
  authors: [{ name: STORE.name }],
  openGraph: {
    type: "website",
    siteName: STORE.seo.siteName,
    title: STORE.seo.defaultTitle,
    description: STORE.seo.defaultDescription,
    images: [{ url: STORE.seo.ogImage, width: 1280, height: 720 }],
    locale: "tr_TR",
  },
  twitter: {
    card: "summary_large_image",
    title: STORE.seo.defaultTitle,
    description: STORE.seo.defaultDescription,
    images: [STORE.seo.ogImage],
  },
  // Favicon / ikonlar dosya tabanlı: app/favicon.ico, app/icon.svg, app/apple-icon.png
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  other: {
    "geo.region": "TR-16",
    "geo.placename": "Orhangazi, Bursa",
    "geo.position": `${STORE.address.lat};${STORE.address.lng}`,
    "ICBM": `${STORE.address.lat}, ${STORE.address.lng}`,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f0f0f" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0f" },
  ],
};

// LocalBusiness Structured Data
const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/#business`,
  name: STORE.name,
  description: STORE.seo.defaultDescription,
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  telephone: STORE.contact.phone,
  sameAs: [STORE.contact.instagramUrl],
  hasMap: STORE.address.googleMapsUrl,
  address: {
    "@type": "PostalAddress",
    streetAddress: `${STORE.address.neighborhood}, ${STORE.address.street}`,
    postalCode: STORE.address.postalCode,
    addressLocality: STORE.address.district,
    addressRegion: STORE.address.city,
    addressCountry: STORE.address.countryCode,
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: STORE.address.lat,
    longitude: STORE.address.lng,
  },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ],
      opens: "07:00",
      closes: "00:00",
    },
  ],
  priceRange: "₺₺",
  servesCuisine: ["Zeytin", "Zeytinyağı", "Doğal Ürünler"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" dir="ltr" className={`${inter.variable} ${playfair.variable}`}>
      <head>
        {/* LocalBusiness Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(localBusinessSchema),
          }}
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
