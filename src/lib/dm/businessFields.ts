/** İşletme bilgileri formundaki alanlar (anahtar, AI'a giden başlıktır). */
export const BUSINESS_FIELDS = [
  { key: "Adres", label: "Adres / şubeler", long: false },
  { key: "Telefon", label: "Telefon / WhatsApp", long: false },
  { key: "Web sitesi", label: "Web sitesi", long: false },
  { key: "Hizmetler ve fiyatlar", label: "Hizmetler / ürünler ve fiyatlar", long: true },
  { key: "Kampanyalar", label: "Güncel kampanyalar", long: true },
  { key: "Ödeme yöntemleri", label: "Ödeme yöntemleri", long: false },
  { key: "Kargo ve teslimat", label: "Kargo / teslimat", long: true },
  { key: "İade ve değişim", label: "İade / değişim", long: true },
  { key: "Sık sorulanlar", label: "Diğer notlar ve sık sorulanlar", long: true },
] as const;
