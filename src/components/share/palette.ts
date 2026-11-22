// Google Takvim benzeri hazır renkler (müşteri rengi seçerken öneri olarak da kullanılır).
export const SHARE_COLORS = [
  "#d50000",
  "#e67c73",
  "#f4511e",
  "#f6bf26",
  "#33b679",
  "#0b8043",
  "#039be5",
  "#3f51b5",
  "#7986cb",
  "#8e24aa",
  "#616161",
  "#795548",
];

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Rengi seçilmemiş müşteriye, alfabetik sırasına göre otomatik renk verilir. */
export const defaultClientColor = (index: number) => SHARE_COLORS[index % SHARE_COLORS.length];

/** Zemin rengine göre okunaklı yazı rengi (açık zeminde koyu, koyu zeminde beyaz). */
export function textOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#1f2937" : "#ffffff";
}
