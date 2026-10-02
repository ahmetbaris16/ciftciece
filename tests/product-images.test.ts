/**
 * Ürün görselleri veritabanında (Y-18): tür dosya imzasından doğrulanır (SVG/HTML reddedilir), boyut sınırı,
 * /gorsel adresinden doğru tür ve önbellek başlıklarıyla sunulur, kapak sırası, kaldırınca veri silinir.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import {
  addProductImage,
  detectImageType,
  ImageUploadError,
  MAX_IMAGE_BYTES,
  removeProductImage,
  updateProductImage,
  uploadedImageIdFromUrl,
} from "@/lib/images/product-images";
import { GET } from "@/app/gorsel/[file]/route";
import { setupTestDb, createProduct } from "./helpers/db";

setupTestDb();

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0]);
const WEBP = Uint8Array.from([...Buffer.from("RIFF"), 36, 0, 0, 0, ...Buffer.from("WEBPVP8 "), 0, 0, 0, 0]);
const isUploadError = (status: number) => (err: unknown) => err instanceof ImageUploadError && err.status === status;

const serve = (url: string) => GET(new Request(`http://localhost${url}`), { params: Promise.resolve({ file: url.replace("/gorsel/", "") }) });

test("tür dosya imzasından: JPEG, PNG, WebP kabul; SVG, HTML, boş dosya reddedilir", () => {
  assert.equal(detectImageType(JPEG), "image/jpeg");
  assert.equal(detectImageType(PNG), "image/png");
  assert.equal(detectImageType(WEBP), "image/webp");
  assert.equal(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
  assert.equal(detectImageType(Buffer.from("<html><script>alert(1)</script>")), null);
  assert.equal(detectImageType(new Uint8Array()), null);
});

test("yükle → /gorsel adresinden sunulur; sıra artar; açıklama boşsa ürün adı", async () => {
  const { product } = await createProduct({ name: "Gemlik Zeytin", priceKurus: 50_000, stock: 5 });
  const first = await addProductImage(product.id, WEBP, { width: 1600, height: 1200, actorId: "admin-1" });
  const second = await addProductImage(product.id, JPEG, { altText: "Kavanoz", actorId: "admin-1" });
  assert.match(first.url, /^\/gorsel\/[a-z0-9]+\.webp$/);
  assert.match(second.url, /^\/gorsel\/[a-z0-9]+\.jpg$/);
  assert.equal(first.altText, "Gemlik Zeytin");
  assert.equal(second.altText, "Kavanoz");
  assert.deepEqual([first.sortOrder, second.sortOrder], [0, 1]);

  const res = await serve(first.url);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/webp");
  assert.match(res.headers.get("cache-control") ?? "", /immutable/);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), WEBP);
  // Uzantı kayıttaki türle uyuşmazsa ya da adres bozuksa 404
  assert.equal((await serve(first.url.replace(".webp", ".png"))).status, 404);
  assert.equal((await serve("/gorsel/../../etc/passwd")).status, 404);
});

test("sınırlar: 2 MB üstü 413, görsel olmayan 415, olmayan ürün 404", async () => {
  const { product } = await createProduct({ priceKurus: 10_000, stock: 1 });
  const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
  big.set(JPEG);
  await assert.rejects(addProductImage(product.id, big, { actorId: null }), isUploadError(413));
  await assert.rejects(addProductImage(product.id, Buffer.from("<svg/>"), { actorId: null }), isUploadError(415));
  await assert.rejects(addProductImage("olmayan-urun", PNG, { actorId: null }), isUploadError(404));
  assert.equal(await prisma.uploadedImage.count(), 0, "reddedilen yükleme veri bırakmaz");
});

test("kapak yap sırayı değiştirir; kaldırınca görsel verisi de silinir", async () => {
  const { product } = await createProduct({ priceKurus: 10_000, stock: 1 });
  const a = await addProductImage(product.id, PNG, { actorId: null });
  const b = await addProductImage(product.id, JPEG, { actorId: null });
  assert.equal(await updateProductImage(product.id, b.id, { makePrimary: true, altText: "Yeni açıklama" }), true);
  const ordered = await prisma.productImage.findMany({ where: { productId: product.id }, orderBy: { sortOrder: "asc" } });
  assert.deepEqual(
    ordered.map((i) => i.id),
    [b.id, a.id]
  );
  assert.equal(ordered[0].altText, "Yeni açıklama");

  assert.equal(await removeProductImage(product.id, a.id), true);
  assert.equal(await prisma.uploadedImage.count({ where: { id: uploadedImageIdFromUrl(a.url)! } }), 0);
  assert.equal((await serve(a.url)).status, 404);
  // Başka ürünün görseli bu ürün üzerinden silinemez
  const { product: other } = await createProduct({ priceKurus: 10_000, stock: 1 });
  assert.equal(await removeProductImage(other.id, b.id), false);
});
