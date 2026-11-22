const MAX_TITLE = 80;

/** Düz metin olarak girilen işi, mevcut Task alanlarına (başlık + açıklama)
 * böler. Kısa tek cümlede sadece başlık dolar; uzun metinde başlık ilk satırın
 * kısaltılmışı, açıklama ise metnin tamamıdır (hiçbir şey kaybolmaz). */
export function splitJobText(text: string) {
  const lines = text.trim().split("\n");
  const first = lines[0].trim();
  const rest = lines.slice(1).join("\n").trim();

  if (first.length <= MAX_TITLE) {
    return { title: first, description: rest || null };
  }
  return {
    title: first.slice(0, MAX_TITLE - 1).trimEnd() + "…",
    description: text.trim(),
  };
}

/** splitJobText'in tersi: ekranda ve düzenleme formunda gösterilecek tam metin. */
export function joinJobText(title: string, description: string | null) {
  if (!description) return title;
  if (title.endsWith("…") && description.startsWith(title.slice(0, -1))) {
    return description;
  }
  return `${title}\n${description}`;
}
