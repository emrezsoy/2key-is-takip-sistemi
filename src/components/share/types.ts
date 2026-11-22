export type SharePostRow = {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  clientId: string | null;
  clientName: string;
  /** Müşterinin takvim rengi (#rrggbb). */
  color: string;
  title: string | null;
  text: string | null;
  /** "POST" | "STORY" | "REEL" */
  kind: "POST" | "STORY" | "REEL";
  /** Paylaşım saati "HH:MM" (Türkiye saati) veya null. */
  time: string | null;
  /** Paylaşıldı olarak işaretlendi mi. */
  published: boolean;
  /** Meta'da planlandı (sadece ekip görür; müşteri görünümünde hep false). */
  metaScheduled: boolean;
  /** Otomatik paylaşım durumu: null (eski elle işaret ya da plansız) | SCHEDULED | PUBLISHING | PUBLISHED | PARTIAL | FAILED. */
  metaStatus: MetaStatus | null;
  /** Son otomatik paylaşım hatası / uyarısı. */
  metaError: string | null;
  /** Müşterinin Meta hesabına erişimimiz ("Meta'da planla" için): OK | NO_ACCOUNT (bağlı değil) | NO_PERMISSION (paylaşım yetkisi yok). */
  metaAccess: "OK" | "NO_ACCOUNT" | "NO_PERMISSION";
  /** Yayınlanan Instagram gönderisinin adresi (varsa). */
  igPermalink: string | null;
  /** Reels kapak görseli (varsa). */
  cover: { url: string; name: string | null } | null;
  /** Sıralı görseller (birden çoksa kaydırmalı paylaşım); ilki kapak. */
  images: ShareImage[];
};

export type MetaStatus = "SCHEDULED" | "PUBLISHING" | "PUBLISHED" | "PARTIAL" | "FAILED";

export type ShareImage = { id: string; url: string; name: string | null; mediaType: "IMAGE" | "VIDEO" };

export type ShareClient = {
  id: string;
  name: string;
  color: string;
  /** Renk elle seçilmiş mi (false = otomatik). */
  custom: boolean;
};
