import { MAX_CLIENT_FILES } from "@/lib/fileStore";

export type Annotation = { index: number; texts: string[] };

/** Revize ekranından gelen formu doğrular: genel not, görsel üzerine yazılan notlar ve çizimli görseller ("g<sıra>.png").
 * `images` teslimdeki dosyaların sırasıdır (görsel numarası = bu sıra, 0'dan). */
export function parseRevisionForm(formData: FormData, images: { mediaType: string }[]) {
  const note = String(formData.get("note") ?? "").trim();
  if (note.length > 2000) throw new Error("Genel not en fazla 2000 karakter olabilir.");

  let annotations: Annotation[] = [];
  try {
    const raw = JSON.parse(String(formData.get("annotations") ?? "[]"));
    if (Array.isArray(raw)) {
      annotations = raw
        .filter((a) => a && Number.isInteger(a.index) && a.index >= 0 && a.index < images.length && Array.isArray(a.texts))
        .map((a) => ({
          index: a.index as number,
          texts: (a.texts as unknown[])
            .map((t) => String(t ?? "").trim().slice(0, 300))
            .filter(Boolean)
            .slice(0, 20),
        }))
        .filter((a) => a.texts.length > 0);
    }
  } catch {
    throw new Error("Notlar okunamadı, lütfen tekrar deneyin.");
  }

  const uploads = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (uploads.length > MAX_CLIENT_FILES) throw new Error(`En fazla ${MAX_CLIENT_FILES} görsel gönderebilirsiniz.`);
  const renamed: File[] = [];
  for (const f of uploads) {
    const m = /^g(\d+)\.png$/.exec(f.name);
    const index = m ? Number(m[1]) : -1;
    const target = images[index];
    if (!target || target.mediaType === "VIDEO") throw new Error("Görsel geçersiz.");
    if (f.type !== "image/png") throw new Error("Görsel PNG olmalı.");
    renamed.push(new File([f], `Görsel ${index + 1} - revize.png`, { type: "image/png" }));
  }

  if (!note && annotations.length === 0 && renamed.length === 0) {
    throw new Error("Önce görsele not/çizim ekleyin ya da genel bir not yazın.");
  }
  return { note, annotations, renamed };
}

/** Revize isteğinin açıklama metni. */
export function revisionDetails(headline: string, note: string, annotations: Annotation[], hasDrawings: boolean) {
  return [
    headline,
    note ? `\nGenel not:\n${note}` : "",
    ...annotations.map((a) => `\nGörsel ${a.index + 1} notları:\n${a.texts.map((t, i) => `${i + 1}) ${t}`).join("\n")}`),
    hasDrawings ? "\n(Görsel üzerindeki çizimler ekteki dosyalarda.)" : "",
  ]
    .filter(Boolean)
    .join("\n");
}
