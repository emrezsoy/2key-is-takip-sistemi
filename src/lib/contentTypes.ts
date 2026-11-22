/** İçerik tablosundaki satırın içerik türü (seçilmemiş = boş). */
export const CONTENT_TYPES = [
  { value: "STATIC", label: "Statik Post" },
  { value: "CAROUSEL", label: "Carousel (Kaydırmalı) Post" },
  { value: "STORY", label: "Story" },
  { value: "REELS", label: "Reels (Dikey Video)" },
  { value: "HORIZONTAL_VIDEO", label: "Yatay Video" },
  { value: "CUSTOM", label: "Özel İçerik" },
] as const;

export const CONTENT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  CONTENT_TYPES.map((t) => [t.value, t.label])
);

export const isContentType = (v: string) => CONTENT_TYPES.some((t) => t.value === v);
