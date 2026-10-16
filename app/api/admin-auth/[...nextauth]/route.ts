/**
 * Yönetim paneli oturumu (NextAuth) — mağaza oturumundan (/api/auth) ayrı uç ve ayrı çerez: aynı tarayıcıda panel
 * açıkken mağazada üye girişi yapmak panel oturumunu düşürmez (lib/auth/auth-options.ts).
 */

import NextAuth from "next-auth";
import { adminAuthOptions } from "@/lib/auth/auth-options";

const handler = NextAuth(adminAuthOptions);

export { handler as GET, handler as POST };
