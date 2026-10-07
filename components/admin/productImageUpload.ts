/**
 * Admin — ürün fotoğrafı yükleme (ürün düzenleme sayfası ve yeni ürün formu ortak kullanır).
 * Fotoğraf yüklemeden önce tarayıcıda küçültülür (en uzun kenar 1600 px, WebP; desteklenmiyorsa JPEG):
 * telefon fotoğrafı (5–10 MB) ~200–500 KB'a iner, veritabanı şişmez, sayfa hızlı açılır.
 */

const MAX_EDGE = 1600;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
/** Sunucudaki sınırla aynı (lib/images/product-images.ts MAX_IMAGES_PER_PRODUCT) */
export const MAX_PRODUCT_IMAGES = 12;
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

async function shrink(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  let blob = await toBlob(canvas, "image/webp", 0.85);
  if (!blob || blob.type !== "image/webp") {
    // WebP kodlayamayan tarayıcı (eski Safari): JPEG; saydam alanlar beyaz olur
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    blob = await toBlob(canvas, "image/jpeg", 0.85);
  }
  bitmap.close();
  if (!blob) throw new Error("encode");
  return { blob, width, height };
}

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  fileName: string;
}

/** Fotoğrafı yüklemeye hazırlar (küçültür). Açılamazsa ya da çok büyükse yöneticiye gösterilecek hata metni döner. */
export async function prepareProductImage(file: File): Promise<PreparedImage | string> {
  let shrunk: { blob: Blob; width: number; height: number };
  try {
    shrunk = await shrink(file);
  } catch {
    return `“${file.name}” açılamadı. JPEG, PNG ya da WebP fotoğraf seçin (iPhone'da “En Uyumlu” biçim).`;
  }
  if (shrunk.blob.size > MAX_UPLOAD_BYTES) return `“${file.name}” küçültüldükten sonra bile 2 MB'tan büyük.`;
  const fileName = file.name.replace(/\.[^.]+$/, "") + (shrunk.blob.type === "image/webp" ? ".webp" : ".jpg");
  return { ...shrunk, fileName };
}

/** Hazır fotoğrafı ürüne ekler: başarılıysa null, değilse hata metni (bağlantı hatasında fetch'in hatası fırlar) */
export async function postProductImage(productId: string, image: PreparedImage, altText: string): Promise<string | null> {
  const form = new FormData();
  form.append("file", image.blob, image.fileName);
  form.append("altText", altText);
  form.append("width", String(image.width));
  form.append("height", String(image.height));
  const res = await fetch(`/api/admin/products/${productId}/images`, { method: "POST", body: form });
  if (res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.error ?? "Fotoğraf yüklenemedi.";
}

/** Küçült + yükle. onStage: "hazırlanıyor" / "yükleniyor" durumunu göstermek için */
export async function uploadProductImage(
  productId: string,
  file: File,
  altText: string,
  onStage?: (stage: "prepare" | "upload") => void
): Promise<string | null> {
  onStage?.("prepare");
  const prepared = await prepareProductImage(file);
  if (typeof prepared === "string") return prepared;
  onStage?.("upload");
  return postProductImage(productId, prepared, altText);
}
