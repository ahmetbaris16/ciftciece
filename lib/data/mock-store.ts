/**
 * Geliştirme deposu — SADECE DATABASE_URL tanımlı değilken (bkz. lib/data/source.ts).
 *
 * Katalog mock'u salt okunurdur (prisma/catalog.ts); üye hesapları ve ürün değerlendirmeleri ise
 * yazılabilir olmalı ki site veritabanısız açıldığında (Siteyi Ac.bat) üyelik/yorum akışı denenebilsin.
 * Veriler proje kökündeki .mock-data/*.json dosyalarında tutulur (gitignore'da). Production'da
 * loadMock() gibi hata fırlatır: gerçek müşteri verisi asla bu dosyalara yazılmaz.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const DIR = path.join(/* turbopackIgnore: true */ process.cwd(), ".mock-data");

type Store = { chain: Promise<unknown> };
const g = globalThis as unknown as { __ciftciMockStore?: Store };
const store: Store = (g.__ciftciMockStore ??= { chain: Promise.resolve() });

function assertDev() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL tanımlı değil — production'da geliştirme deposu kullanılamaz.");
  }
}

async function readFile<T>(name: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, name), "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

/** Okur (dosya yoksa fallback). */
export async function readMock<T>(name: string, fallback: T): Promise<T> {
  assertDev();
  await store.chain.catch(() => undefined); // devam eden yazmanın bitmesini bekle
  return readFile(name, fallback);
}

/**
 * Oku-değiştir-yaz: aynı süreçteki eşzamanlı istekler sıraya girer (kayıp güncelleme olmaz).
 * mutate yeni değeri ve çağırana dönecek sonucu verir.
 */
export async function updateMock<T, R>(
  name: string,
  fallback: T,
  mutate: (current: T) => { next: T; result: R } | Promise<{ next: T; result: R }>
): Promise<R> {
  assertDev();
  const run = store.chain.catch(() => undefined).then(async () => {
    const current = await readFile(name, fallback);
    const { next, result } = await mutate(current);
    await fs.mkdir(DIR, { recursive: true });
    const file = path.join(DIR, name);
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
    await fs.rename(tmp, file);
    return result;
  });
  store.chain = run;
  return run;
}
