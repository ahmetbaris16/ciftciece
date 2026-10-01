/**
 * Şifre hash'leme (bcrypt, maliyet 11 ≈ 0,1 sn).
 * Olmayan e-postayla girişte de aynı süre harcanır: yanıt süresinden hesabın var olup
 * olmadığı anlaşılmasın.
 */

import { compare, hash } from "bcryptjs";

const COST = 11;

/** Hiçbir şifreyle eşleşmeyen, yalnızca süre eşitlemek için kullanılan hash */
const TIMING_DUMMY_HASH = "$2b$11$FpywDvAq1DfULRCamKR3zOmP6gU/9FwrAeGAnzZIcD9rGeithX2da";

export function hashPassword(password: string): Promise<string> {
  return hash(password, COST);
}

/** passwordHash yoksa (hesap yok / şifresiz) yine de karşılaştırma yapar ve false döner. */
export async function verifyPassword(password: string, passwordHash: string | null | undefined): Promise<boolean> {
  if (!passwordHash) {
    await compare(password, TIMING_DUMMY_HASH);
    return false;
  }
  return compare(password, passwordHash);
}
