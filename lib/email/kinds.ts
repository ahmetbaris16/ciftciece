/**
 * E-posta türleri (email_messages.kind) ve admin'de gösterilen adları.
 */

export const EMAIL_KIND_TR: Record<string, string> = {
  ORDER_RECEIVED: "Sipariş teyidi ve sözleşmeler",
  PAYMENT_RECEIVED: "Ödeme alındı",
  ORDER_SHIPPED: "Kargoya verildi",
  ORDER_DELIVERED: "Teslim edildi",
  ORDER_CANCELLED: "Sipariş iptali",
  REFUND_RECORDED: "İade",
  REQUEST_RECEIVED: "Talep alındı",
  TRANSFER_REMINDER: "Havale hatırlatması",
  CUSTOM_MESSAGE: "Admin mesajı",
  CONTACT_REPLY: "İletişim mesajına yanıt",
  TEST: "Deneme e-postası",
  STORE_NEW_ORDER: "Yeni sipariş (işletmeye)",
  STORE_PAYMENT_ALERT: "Ödeme uyarısı (işletmeye)",
  STORE_CUSTOMER_REQUEST: "Müşteri talebi (işletmeye)",
  STORE_ORDER_CANCELLED_BY_CUSTOMER: "Müşteri iptali (işletmeye)",
  STORE_CONTACT_MESSAGE: "İletişim mesajı (işletmeye)",
  STORE_REVIEW_PUBLISHED: "Yeni ürün değerlendirmesi (işletmeye)",
  // Eski kurallar (değerlendirme onaya düşüyordu): geçmiş kayıtların etiketi
  STORE_REVIEW_PENDING: "Yorum onayı (işletmeye)",
};

export const EMAIL_STATUS_TR: Record<string, { label: string; color: string }> = {
  QUEUED: { label: "Kuyrukta", color: "#e8c07a" },
  SENDING: { label: "Gönderiliyor", color: "#9ec5f0" },
  SENT: { label: "Gönderildi", color: "#9fd39f" },
  FAILED: { label: "Gönderilemedi", color: "#f3a0a0" },
  CANCELLED: { label: "İptal", color: "rgba(232,228,217,0.5)" },
};

export const emailKindLabel = (kind: string) => EMAIL_KIND_TR[kind] ?? kind;
