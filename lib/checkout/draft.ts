/**
 * Ödeme formunun taslağı — yalnız kartla ödemede bankanın ödeme sayfasına geçerken yazılır; müşteri ödeme
 * olmadan geri dönünce (/odeme?error=…) bir kez okunup silinir. Böylece bilgileri baştan doldurmadan ödeme
 * adımından devam eder (eskiden ödeme adımı boş bilgilerle açılıyordu).
 *
 * Kişisel veri tarayıcıda yalnız bu kısa süre için tutulur: sessionStorage (yalnız bu sekme, sekme kapanınca
 * silinir), en çok 2 saat geçerli, ödeme onaylanınca sipariş sayfası siler. Kart bilgisi zaten sitemize gelmez;
 * sözleşme onayı saklanmaz (her denemede yeniden verilir).
 */

export interface ContactInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}
export interface ShippingInfo {
  address: string;
  district: string;
  city: string;
  postalCode: string;
}
export interface BillingState {
  type: "INDIVIDUAL" | "CORPORATE";
  companyName: string;
  taxOffice: string;
  taxNumber: string;
  sameAsShipping: boolean;
  billingAddress: string;
  billingDistrict: string;
  billingCity: string;
}
export interface CheckoutDraft {
  contact: ContactInfo;
  shipping: ShippingInfo;
  billing: BillingState;
  note: string;
  method: string | null;
}

const STORAGE_KEY = "ciftci_ece_checkout_draft_v1";
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

const isRecordOfStrings = (v: unknown, keys: string[]): boolean =>
  typeof v === "object" && v !== null && keys.every((k) => typeof (v as Record<string, unknown>)[k] === "string");

function isDraft(v: unknown): v is CheckoutDraft {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, unknown>;
  const b = d.billing as Record<string, unknown> | undefined;
  return (
    isRecordOfStrings(d.contact, ["firstName", "lastName", "email", "phone"]) &&
    isRecordOfStrings(d.shipping, ["address", "district", "city", "postalCode"]) &&
    isRecordOfStrings(b, ["companyName", "taxOffice", "taxNumber", "billingAddress", "billingDistrict", "billingCity"]) &&
    (b!.type === "INDIVIDUAL" || b!.type === "CORPORATE") &&
    typeof b!.sameAsShipping === "boolean" &&
    typeof d.note === "string" &&
    (d.method === null || typeof d.method === "string")
  );
}

export function saveCheckoutDraft(draft: CheckoutDraft) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // sessionStorage kapalı (gizli mod vb.): dönüşte bilgiler yeniden yazılır
  }
}

/**
 * Taslağı okur (silmez: geri yükleyen bileşen sonra forgetCheckoutDraft çağırır — React geliştirme kipinde
 * başlangıç değeri iki kez hesaplanır). Yoksa, bozuksa ya da 2 saatten eskiyse null; sunucuda da null.
 */
export function peekCheckoutDraft(): CheckoutDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: unknown };
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return isDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function forgetCheckoutDraft() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // yok sayılır
  }
}
