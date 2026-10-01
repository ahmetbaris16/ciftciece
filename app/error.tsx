"use client";

import ErrorContent from "@/components/layout/ErrorContent";

// Mağaza dışındaki (ör. yönetim paneli) sayfalarda beklenmeyen hata
export default function RootError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorContent {...props} />;
}
