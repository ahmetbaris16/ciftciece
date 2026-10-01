/**
 * Çiftçi Ece — Merkezi Tip Tanımları
 *
 * Prisma schema ile birebir eşleşir.
 * Fiyatlar her zaman KURUŞ (integer). Float kullanma.
 */

// ============================================================
// KATEGORİ
// ============================================================

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder: number;
  isPublished: boolean;
}

// ============================================================
// ÜRÜN
// ============================================================

export interface ProductImage {
  id: string;
  url: string;
  altText?: string | null;
  sortOrder: number;
}

export interface ProductVariant {
  id: string;
  name: string; // "500g", "1kg", "5L"
  sku?: string | null;
  priceKurus: number; // 0 = fiyat girilmemiş
  isAvailable: boolean;
  sortOrder: number;
  stockQuantity?: number; // Inventory'den join edildiğinde
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  categoryId: string;
  category: Category;
  images: ProductImage[];
  variants: ProductVariant[];
  isPublished: boolean;
  isFeatured: boolean;
  sortOrder: number;
  /** KDV oranı (baz puan: 100 = %1); boş = girilmemiş */
  vatRateBps?: number | null;
}

// Liste sayfaları için hafif versiyon (images[0] + variants[0] içerir)
export interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  primaryImage: ProductImage | null;
  primaryVariant: ProductVariant | null; // En ucuz/en önce gösterilecek varyant
  isFeatured: boolean;
}

// ============================================================
// SEPET
// ============================================================

export interface CartItem {
  variantId: string;
  productSlug: string;
  productName: string;
  variantName: string;
  priceKurus: number;
  quantity: number;
  imageUrl: string;
  imageAlt: string;
  isAvailable: boolean;
  maxQuantity?: number; // stok limiti
}

export interface Cart {
  items: CartItem[];
  itemCount: number; // toplam adet
  subtotalKurus: number;
}

// ============================================================
// SİPARİŞ
// ============================================================

export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED";

export interface ShippingAddress {
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  district: string;
  postalCode?: string;
  address: string;
  /** Sipariş anındaki kargo firması (snapshot; artık yalnız Yurtiçi Kargo) */
  carrier?: { id: string; name: string };
  /**
   * Kargo ücretinin ödenme şekli (sipariş anı):
   * "free" = ücretsiz kargo, "prepaid" = siparişte tahsil edildi, "recipient" = alıcı ödemeli (teslimatta ödenir)
   */
  shippingMode?: "free" | "prepaid" | "recipient";
  /** Ücretli kargoda sipariş anındaki koli planı (paketleme için; ücretsiz kargoda yok) */
  parcels?: Array<{
    box: string;
    items: number;
    grossGrams: number;
    desi: number;
    billableDesi: number;
    feeKurus: number;
  }>;
}

export interface OrderItem {
  id: string;
  variantId: string;
  snapshotName: string;
  snapshotVariant: string;
  snapshotPrice: number; // kuruş
  quantity: number;
  /** Sipariş anındaki KDV oranı (baz puan); bilinmiyorsa null */
  vatRateBps: number | null;
  /** Kalem indirimi (kuruş) */
  discountKurus: number;
}

export interface Order {
  id: string;
  reference: string;
  guestEmail?: string | null;
  guestName?: string | null;
  status: OrderStatus;
  items: OrderItem[];
  shippingAddress: ShippingAddress;
  subtotalKurus: number;
  shippingKurus: number;
  discountKurus: number;
  totalKurus: number;
  paymentMethod: PaymentMethod;
  /** Kapıda ödeme hizmet bedeli vb. (totalKurus'a dahil) */
  paymentFeeKurus: number;
  /** Bu andan sonra ödenmemişse otomatik iptal (kapıda ödemede yok) */
  paymentDueAt: Date | null;
  /** Yalnız eski kayıt / insan notu — kod artık yazmaz */
  notes?: string | null;
  /** NEEDS_ATTENTION: ödeme tarafında insan kararı gerekiyor (ayrıntı payment_alerts) */
  needsAttention: boolean;
  createdAt: Date;
}

export type PaymentMethod = "CARD" | "BANK_TRANSFER" | "CASH_ON_DELIVERY";

// ============================================================
// CHECKOUT
// ============================================================

export interface CheckoutContactInfo {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
}

export interface CheckoutShippingInfo {
  city: string;
  district: string;
  postalCode?: string;
  address: string;
}

export type CheckoutStep = "iletisim" | "teslimat" | "kargo" | "odeme";

// ============================================================
// ÖDEME
// ============================================================

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";

// ============================================================
// ARAMA
// ============================================================

export interface SearchFilters {
  query?: string;
  categorySlug?: string;
  minPriceKurus?: number;
  maxPriceKurus?: number;
  sortBy?: "relevance" | "price_asc" | "price_desc" | "newest";
  page?: number;
  perPage?: number;
}

export interface SearchResult {
  products: ProductSummary[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ============================================================
// YARDIMCI
// ============================================================

/** Kuruş → "129,90 ₺" */
export function formatPrice(kurus: number): string {
  return (kurus / 100).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Kuruş → "129,90" (sembol olmadan) */
export function formatPriceRaw(kurus: number): string {
  return (kurus / 100).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
