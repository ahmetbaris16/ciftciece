"use client";

/**
 * NextAuth SessionProvider wrapper
 * Admin layout'ta kullanılır. Panel oturumu mağaza oturumundan ayrıdır (/api/admin-auth, ayrı çerez); signIn/signOut
 * çağrıları bu adresi kullansın diye basePath burada verilir.
 */

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export function SessionProvider({ children }: { children: ReactNode }) {
  return <NextAuthSessionProvider basePath="/api/admin-auth">{children}</NextAuthSessionProvider>;
}
