// Reklam yönetimi için arayüz ve sunucunun ortak kullandığı tipler / sabitler (sunucuya özel içe aktarma yok).

// ---- Amaçlar ----------------------------------------------------------------------------

export type ObjectiveKey =
  | "MESSAGES"
  | "PROFILE"
  | "TRAFFIC"
  | "LANDING"
  | "LEADS_FORM"
  | "CONVERSIONS"
  | "REACH"
  | "VIDEO_VIEWS"
  | "POST_ENGAGEMENT"
  | "PAGE_LIKES";

export const OBJECTIVES: Record<
  ObjectiveKey,
  { label: string; hint: string; short: string; objective: string; optimization: string; destination: string | null; promotesPage: boolean; needsLink: boolean }
> = {
  MESSAGES: {
    label: "Mesaj",
    hint: "Instagram DM, Messenger ya da WhatsApp'tan mesaj almak için.",
    short: "Mesaj",
    objective: "OUTCOME_ENGAGEMENT",
    optimization: "CONVERSATIONS",
    destination: null, // hedefe göre (MESSAGE_DESTINATIONS)
    promotesPage: true,
    needsLink: false,
  },
  PROFILE: {
    label: "Instagram profil ziyareti",
    hint: "Profile ziyaret ve takipçi kazanmak için.",
    short: "Profil Ziyareti",
    objective: "OUTCOME_TRAFFIC",
    optimization: "PROFILE_VISIT",
    destination: "INSTAGRAM_PROFILE",
    promotesPage: true,
    needsLink: false,
  },
  TRAFFIC: {
    label: "Web sitesi trafiği (tıklama)",
    hint: "Bağlantı tıklamalarını artırır.",
    short: "Trafik",
    objective: "OUTCOME_TRAFFIC",
    optimization: "LINK_CLICKS",
    destination: "WEBSITE",
    promotesPage: false,
    needsLink: true,
  },
  LANDING: {
    label: "Açılış sayfası görüntüleme",
    hint: "Siteye gerçekten girip sayfanın yüklenmesini bekleyenlere optimize eder.",
    short: "Açılış Sayfası",
    objective: "OUTCOME_TRAFFIC",
    optimization: "LANDING_PAGE_VIEWS",
    destination: "WEBSITE",
    promotesPage: false,
    needsLink: true,
  },
  LEADS_FORM: {
    label: "Potansiyel müşteri (anlık form)",
    hint: "Reklamın içinde açılan formla ad, telefon, e-posta toplar.",
    short: "Form",
    objective: "OUTCOME_LEADS",
    optimization: "LEAD_GENERATION",
    destination: "ON_AD",
    promotesPage: true,
    needsLink: false,
  },
  CONVERSIONS: {
    label: "Web sitesi dönüşümü (pixel)",
    hint: "Satın alma, kayıt, form gibi site olaylarına optimize eder (Meta pixel gerekir).",
    short: "Dönüşüm",
    objective: "OUTCOME_SALES",
    optimization: "OFFSITE_CONVERSIONS",
    destination: "WEBSITE",
    promotesPage: false,
    needsLink: true,
  },
  REACH: {
    label: "Erişim / bilinirlik",
    hint: "Reklamı mümkün olduğunca çok kişiye gösterir.",
    short: "Erişim",
    objective: "OUTCOME_AWARENESS",
    optimization: "REACH",
    destination: null,
    promotesPage: true,
    needsLink: false,
  },
  VIDEO_VIEWS: {
    label: "Video izlenme",
    hint: "Videoyu sonuna kadar (ya da 15 sn) izleyecek kişilere gösterir.",
    short: "Video İzlenme",
    objective: "OUTCOME_AWARENESS",
    optimization: "THRUPLAY",
    destination: null,
    promotesPage: true,
    needsLink: false,
  },
  POST_ENGAGEMENT: {
    label: "Gönderi etkileşimi",
    hint: "Beğeni, yorum, paylaşım almak için (genelde mevcut gönderiyle).",
    short: "Etkileşim",
    objective: "OUTCOME_ENGAGEMENT",
    optimization: "POST_ENGAGEMENT",
    destination: "ON_POST",
    promotesPage: false,
    needsLink: false,
  },
  PAGE_LIKES: {
    label: "Facebook sayfa beğenisi",
    hint: "Facebook sayfasına beğeni / takipçi kazandırır.",
    short: "Sayfa Beğenisi",
    objective: "OUTCOME_ENGAGEMENT",
    optimization: "PAGE_LIKES",
    destination: "ON_PAGE",
    promotesPage: true,
    needsLink: false,
  },
};

/** Hikayeye özel medya ve çoklu metin / başlık seçenekleri (Meta "dinamik kreatif" sayar) sadece bu amaçlarda çalışır;
 * mesaj, form, profil ziyareti ve sayfa beğenisinde Meta kabul etmiyor. */
export const supportsVariants = (o: ObjectiveKey) => ["TRAFFIC", "LANDING", "CONVERSIONS", "REACH", "VIDEO_VIEWS", "POST_ENGAGEMENT"].includes(o);

export type MessageDestination = "IG" | "MESSENGER" | "WHATSAPP" | "IG_MESSENGER" | "IG_WHATSAPP" | "MESSENGER_WHATSAPP" | "ALL";

export const MESSAGE_DESTINATIONS: Record<MessageDestination, { label: string; destination: string; whatsapp: boolean; instagram: boolean }> = {
  IG: { label: "Instagram DM", destination: "INSTAGRAM_DIRECT", whatsapp: false, instagram: true },
  MESSENGER: { label: "Messenger", destination: "MESSENGER", whatsapp: false, instagram: false },
  WHATSAPP: { label: "WhatsApp", destination: "WHATSAPP", whatsapp: true, instagram: false },
  IG_MESSENGER: { label: "Instagram + Messenger", destination: "MESSAGING_INSTAGRAM_DIRECT_MESSENGER", whatsapp: false, instagram: true },
  IG_WHATSAPP: { label: "Instagram + WhatsApp", destination: "MESSAGING_INSTAGRAM_DIRECT_WHATSAPP", whatsapp: true, instagram: true },
  MESSENGER_WHATSAPP: { label: "Messenger + WhatsApp", destination: "MESSAGING_MESSENGER_WHATSAPP", whatsapp: true, instagram: false },
  ALL: { label: "Instagram + Messenger + WhatsApp", destination: "MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP", whatsapp: true, instagram: true },
};

export const CONVERSION_EVENTS: { value: string; label: string; sales: boolean }[] = [
  { value: "PURCHASE", label: "Satın alma", sales: true },
  { value: "ADD_TO_CART", label: "Sepete ekleme", sales: true },
  { value: "INITIATED_CHECKOUT", label: "Ödeme başlatma", sales: true },
  { value: "ADD_PAYMENT_INFO", label: "Ödeme bilgisi ekleme", sales: true },
  { value: "LEAD", label: "Potansiyel müşteri (form)", sales: false },
  { value: "COMPLETE_REGISTRATION", label: "Kayıt tamamlama", sales: false },
  { value: "CONTACT", label: "İletişim", sales: false },
  { value: "SUBMIT_APPLICATION", label: "Başvuru gönderme", sales: false },
  { value: "SCHEDULE", label: "Randevu", sales: false },
  { value: "SUBSCRIBE", label: "Abonelik", sales: false },
  { value: "VIEW_CONTENT", label: "İçerik görüntüleme", sales: false },
];

export const CTA_OPTIONS: { value: string; label: string }[] = [
  { value: "LEARN_MORE", label: "Daha fazla bilgi al" },
  { value: "SHOP_NOW", label: "Alışveriş yap" },
  { value: "ORDER_NOW", label: "Sipariş ver" },
  { value: "BUY_NOW", label: "Hemen satın al" },
  { value: "CONTACT_US", label: "Bize ulaşın" },
  { value: "SIGN_UP", label: "Kaydol" },
  { value: "APPLY_NOW", label: "Hemen başvur" },
  { value: "BOOK_NOW", label: "Rezervasyon yap" },
  { value: "GET_OFFER", label: "Teklif al" },
  { value: "GET_QUOTE", label: "Fiyat teklifi al" },
  { value: "DOWNLOAD", label: "İndir" },
  { value: "SUBSCRIBE", label: "Abone ol" },
  { value: "WATCH_MORE", label: "Daha fazla izle" },
  { value: "CALL_NOW", label: "Hemen ara" },
];

export const LEAD_CTAS = ["SIGN_UP", "LEARN_MORE", "GET_QUOTE", "APPLY_NOW", "CONTACT_US", "SUBSCRIBE", "BOOK_NOW", "GET_OFFER"];

export const SPECIAL_CATEGORIES: { value: SpecialCategory; label: string }[] = [
  { value: "", label: "Yok" },
  { value: "HOUSING", label: "Konut (emlak satış / kiralama)" },
  { value: "EMPLOYMENT", label: "İstihdam (iş ilanı)" },
  { value: "FINANCIAL_PRODUCTS_SERVICES", label: "Finansal ürün / kredi" },
  { value: "ISSUES_ELECTIONS_POLITICS", label: "Sosyal konular / seçim / siyaset" },
];
export type SpecialCategory = "" | "HOUSING" | "EMPLOYMENT" | "FINANCIAL_PRODUCTS_SERVICES" | "ISSUES_ELECTIONS_POLITICS";

export const BID_STRATEGIES: { value: BidStrategy; label: string; hint: string }[] = [
  { value: "LOWEST_COST_WITHOUT_CAP", label: "En yüksek hacim (önerilen)", hint: "Bütçeyle en çok sonucu alır." },
  { value: "COST_CAP", label: "Sonuç başı maliyet hedefi", hint: "Ortalama sonuç maliyetini girdiğin tutarın çevresinde tutar." },
  { value: "LOWEST_COST_WITH_BID_CAP", label: "Teklif sınırı", hint: "Açık artırmada girdiğin tutardan fazla teklif vermez." },
];
export type BidStrategy = "LOWEST_COST_WITHOUT_CAP" | "COST_CAP" | "LOWEST_COST_WITH_BID_CAP";

// ---- Yerleşimler --------------------------------------------------------------------------

export const PLACEMENTS: { platform: "facebook" | "instagram" | "messenger" | "audience_network"; key: string; label: string; vertical?: boolean }[] = [
  { platform: "facebook", key: "feed", label: "Facebook akış" },
  { platform: "facebook", key: "story", label: "Facebook hikaye", vertical: true },
  { platform: "facebook", key: "facebook_reels", label: "Facebook Reels", vertical: true },
  { platform: "facebook", key: "marketplace", label: "Marketplace" },
  { platform: "facebook", key: "video_feeds", label: "Facebook video akışı" },
  { platform: "facebook", key: "profile_feed", label: "Facebook profil akışı" },
  { platform: "facebook", key: "search", label: "Facebook arama sonuçları" },
  { platform: "facebook", key: "right_hand_column", label: "Sağ sütun (masaüstü)" },
  { platform: "facebook", key: "instream_video", label: "Video içi (in-stream)" },
  { platform: "instagram", key: "stream", label: "Instagram akış" },
  { platform: "instagram", key: "story", label: "Instagram hikaye", vertical: true },
  { platform: "instagram", key: "reels", label: "Instagram Reels", vertical: true },
  { platform: "instagram", key: "explore", label: "Instagram keşfet" },
  { platform: "instagram", key: "explore_home", label: "Keşfet ana sayfa" },
  { platform: "instagram", key: "profile_feed", label: "Instagram profil akışı" },
  { platform: "instagram", key: "ig_search", label: "Instagram arama sonuçları" },
  { platform: "messenger", key: "story", label: "Messenger hikaye", vertical: true },
  { platform: "audience_network", key: "classic", label: "Audience Network" },
];
export const placementId = (p: { platform: string; key: string }) => `${p.platform}:${p.key}`;

// ---- Hedef kitle --------------------------------------------------------------------------

export type LocationPick = {
  key: string;
  type: "country" | "region" | "city" | "medium_geo_area" | "neighborhood";
  name: string;
  radius?: number;
};
/** Detaylı hedefleme öğesi: type = Meta'daki grup (interests, behaviors, family_statuses, work_positions, ...). */
export type TargetItem = { id: string; name: string; type: string };
export type AudienceRef = { id: string; name: string };
export type LocaleRef = { key: number; name: string };

export type AudienceDraft = {
  locations: LocationPick[];
  excludedLocations: LocationPick[];
  /** all = bu konumda yaşayan ya da son bulunan; home = sadece yaşayan */
  locationMode: "all" | "home";
  ageMin: number;
  ageMax: number;
  gender: "all" | "male" | "female";
  detailed: TargetItem[];
  customAudiences: AudienceRef[];
  excludedAudiences: AudienceRef[];
  locales: LocaleRef[];
  advantage: boolean;
  placements: { mode: "auto" | "manual"; ids: string[] };
  /** Düzenlemede korunacak, arayüzde düzenlenmeyen Meta ayarları (harita iğneleri vb.) */
  preservedNote?: string | null;
};

export const DEFAULT_AUDIENCE: AudienceDraft = {
  locations: [],
  excludedLocations: [],
  locationMode: "all",
  ageMin: 18,
  ageMax: 65,
  gender: "all",
  detailed: [],
  customAudiences: [],
  excludedAudiences: [],
  locales: [],
  advantage: true,
  placements: { mode: "auto", ids: [] },
};

// ---- Reklam -------------------------------------------------------------------------------

export type UploadedMedia =
  | { type: "image"; hash: string; preview: string }
  | { type: "video"; videoId: string; thumbUrl: string; preview: string };

export type CarouselCard = { media: UploadedMedia | null; headline: string; description: string; link: string };

export type ExistingPost = { kind: "fb" | "ig"; id: string; thumb: string | null; text: string | null; date: string; permalink?: string | null };

export type AdDraft = {
  key: string;
  name: string;
  format: "single" | "carousel" | "existing";
  media: UploadedMedia | null;
  /** Hikaye / Reels için ayrı 9:16 medya (isteğe bağlı) */
  storyMedia: UploadedMedia | null;
  cards: CarouselCard[];
  existing: ExistingPost | null;
  /** Ana metin seçenekleri (ilki asıl metin; birden fazlaysa Meta en iyisini dener) */
  texts: string[];
  headlines: string[];
  description: string;
  link: string;
  cta: string;
  utm: string;
  welcomeText: string;
  welcomeQuestions: string[];
  /** Hazır soruya basılınca giden otomatik cevap (welcomeQuestions ile aynı sırada; eski taslaklarda olmayabilir). */
  welcomeAnswers?: string[];
  leadFormId: string;
  /** Meta'nın otomatik kreatif iyileştirmeleri (parlaklık, müzik, metin önerisi ...) */
  enhancements: boolean;
};

export const newAd = (n = 1): AdDraft => ({
  key: Math.random().toString(36).slice(2),
  name: `Reklam ${n}`,
  format: "single",
  media: null,
  storyMedia: null,
  cards: [],
  existing: null,
  texts: [""],
  headlines: [""],
  description: "",
  link: "",
  cta: "LEARN_MORE",
  utm: "",
  welcomeText: "",
  welcomeQuestions: [],
  welcomeAnswers: [],
  leadFormId: "",
  enhancements: false,
});

// ---- Reklam seti / kampanya ---------------------------------------------------------------

export type AdSetDraft = {
  key: string;
  name: string;
  /** TL (reklam seti bütçesi kullanılıyorsa) */
  budget: number;
  /** TL (maliyet hedefi / teklif sınırı stratejisinde) */
  bidAmount: number | null;
  startTime: string | null;
  endTime: string | null;
  /** Saatli yayın (sadece toplam bütçede): günler 0=Pazar..6=Cumartesi */
  schedule: { days: number[]; startHour: number; endHour: number } | null;
  /** Erişim amacında: aynı kişiye en fazla N kez / gün */
  frequency: { max: number; days: number } | null;
  audience: AudienceDraft;
  ads: AdDraft[];
};

export const newAdSet = (n = 1): AdSetDraft => ({
  key: Math.random().toString(36).slice(2),
  name: `Reklam seti ${n}`,
  budget: 200,
  bidAmount: null,
  startTime: null,
  endTime: null,
  schedule: null,
  frequency: null,
  audience: JSON.parse(JSON.stringify(DEFAULT_AUDIENCE)),
  ads: [newAd(1)],
});

export type CampaignDraft = {
  name: string;
  objective: ObjectiveKey;
  destination: MessageDestination;
  pixelId: string;
  conversionEvent: string;
  specialCategory: SpecialCategory;
  budgetLevel: "campaign" | "adset";
  budgetType: "daily" | "lifetime";
  /** TL (kampanya bütçesi kullanılıyorsa) */
  campaignBudget: number;
  bidStrategy: BidStrategy;
  /** TL, kampanya harcama limiti (boş = yok) */
  spendCap: number | null;
  /** 2+ reklam setinde A/B testi */
  abTest: boolean;
  adsets: AdSetDraft[];
  activate: boolean;
};

// ---- Diğer --------------------------------------------------------------------------------

export type CopySpec = {
  name: string;
  startTime: string | null;
  endTime: string | null;
  /** TL; boş = kaynakla aynı */
  dailyBudget: number | null;
  activate: boolean;
};

export type CampaignDetail = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  objective: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  spendCap: number | null;
  bidStrategy: string | null;
  accountId: string;
  managerUrl: string;
  adsets: {
    id: string;
    name: string;
    status: string;
    effectiveStatus: string;
    dailyBudget: number | null;
    lifetimeBudget: number | null;
    startTime: string | null;
    endTime: string | null;
    optimization: string | null;
    destination: string | null;
    targeting: { locations: string[]; age: string; gender: string; interests: string[]; advantage: boolean; audiences: string[]; placements: string };
  }[];
  ads: {
    id: string;
    name: string;
    adsetId: string;
    status: string;
    effectiveStatus: string;
    thumbnail: string | null;
    body: string | null;
    title: string | null;
    cta: string | null;
    previewUrl: string | null;
    issues: string[];
    editable: boolean;
  }[];
};

/** Kampanya kurma penceresinde seçilebilecek reklam hesabı. */
export type ComposerAccount = {
  metaId: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  currency: string | null;
};

/** Paylaşım Takvimi'nden seçilebilecek medya. */
export type ComposerMedia = {
  url: string;
  name: string;
  type: "IMAGE" | "VIDEO";
  date: string;
  title: string | null;
  text: string | null;
};

export type ComposerContext = {
  page: string | null;
  pageId: string | null;
  instagram: string | null;
  media: ComposerMedia[];
  pixels: { id: string; name: string }[];
  audiences: { id: string; name: string; type: string; size: number | null }[];
  leadForms: { id: string; name: string; status: string }[];
  leadTosAccepted: boolean;
  leadTosUrl: string | null;
};

export type AdActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };
