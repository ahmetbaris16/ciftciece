"use client";

import ErrorContent from "@/components/layout/ErrorContent";

// Mağaza sayfalarında beklenmeyen hata: başlık ve altbilgi yerinde kalır
export default function ShopError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorContent {...props} />;
}
