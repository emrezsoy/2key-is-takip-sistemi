// Sesli kurulum asistanının kontrol listesi. Sorular sonradan Emre ile netleştirilecek; buradan değiştirilir.
// required: zorunlu alanlar tamamlanınca asistan kapanış aşamasına geçer.

export type ChecklistItem = { key: string; question: string; required: boolean };

export const ONBOARDING_CHECKLIST: ChecklistItem[] = [
  { key: "isletme_tanimi", question: "İşletme ne iş yapıyor, ne satıyor ya da hangi hizmeti veriyor?", required: true },
  { key: "hedef_musteri", question: "Müşterileri genelde kimler, en çok hangi konularda mesaj atıyorlar?", required: true },
  { key: "urun_hizmet_fiyat", question: "Öne çıkan ürün/hizmetler ve fiyatları (ya da fiyat listesi var mı, son adımda yüklenebilir)", required: true },
  { key: "calisma_saatleri", question: "Çalışma günleri ve saatleri", required: true },
  { key: "adres_iletisim", question: "Adres / şubeler, telefon, web sitesi", required: true },
  { key: "siparis_randevu", question: "Müşteri nasıl sipariş verir ya da randevu alır? Randevu sistemi gerekir mi?", required: true },
  { key: "kargo_teslimat", question: "Kargo / teslimat süresi ve ücreti (varsa)", required: false },
  { key: "iade_degisim", question: "İade ve değişim koşulları (varsa)", required: false },
  { key: "odeme", question: "Ödeme yöntemleri", required: false },
  { key: "kampanyalar", question: "Güncel kampanya ya da indirim var mı?", required: false },
  { key: "uslup", question: "Müşterilere nasıl hitap edilmeli (siz/sen, resmî/samimi), emoji kullanılsın mı?", required: true },
  { key: "yapilmamasi_gerekenler", question: "AI'ın asla söylememesi ya da yapmaması gereken şeyler", required: false },
  { key: "insana_devir", question: "Hangi durumlarda konuşma size (insana) devredilmeli?", required: false },
];

export function onboardingInstructions(ownerName: string | null, businessName: string | null, collected: Record<string, string>) {
  const list = ONBOARDING_CHECKLIST.map((c) => `- ${c.key}${c.required ? " (zorunlu)" : ""}: ${c.question}${collected[c.key] ? ` [ALINDI: ${collected[c.key].slice(0, 80)}]` : ""}`).join("\n");
  return `Sen 2 Key Idea ajansının sesli kurulum asistanısın. Türkçe konuşursun; sıcak, kısa ve doğal cümleler kurarsın.
Karşındaki kişi ${ownerName ? `${ownerName} adlı ` : ""}işletme sahibi${businessName ? ` (${businessName})` : ""}. Ona adıyla hitap et.
Amaç: Instagram/Facebook mesajlarını yanıtlayacak yapay zekâ asistanı için işletmeyi tanımak.
Başta kendini kısaca tanıt ve görüşmenin yaklaşık 10 dakika süreceğini söyle.
Aşağıdaki kontrol listesindeki bilgileri sırayla, sohbet havasında sor. Her bilgiyi aldıkça HEMEN save_field aracıyla kaydet (key = listedeki anahtar, value = kısa ve net özet).
Bir cevapta birden fazla bilgi gelirse hepsini ayrı ayrı kaydet. Anlamadığın yeri bir kez netleştir; uzatma.
Zorunlu alanlar tamamlanınca kapanış aşamasına geç: topladıklarını 3-4 cümleyle özetle, "eklemek istediğiniz bir şey var mı?" diye sor ve cevabını bekle (varsa onu da kaydet),
sonra teşekkür edip vedalaş ve end_call aracını çağır. Konuşma çok uzarsa nazikçe toparla; en fazla 15 dakika.
Fiyat listesi, menü ve ürün görsellerinin görüşmeden sonra "son adım" ekranında yüklenebileceğini söyle.
KONTROL LİSTESİ:
${list}`;
}
