// İş kartındaki "Revize notları" metni bloklardan oluşur: her blok "[tarih] Müşteri revizesi" ya da "[tarih] Yönetici revizesi (Ad)"
// başlığıyla başlar, bloklar "──────────" çizgisiyle ayrılır. Başlığı olmayan eski notlar yönetici revizesi sayılır.

export type RevisionSource = "CLIENT" | "ADMIN";
export type RevisionBlock = { source: RevisionSource; header: string | null; body: string };

export const REVISION_SEPARATOR = "\n\n──────────\n";

export function revisionStamp(now = new Date()) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  }).format(now);
}

/** Mevcut nota yeni bir yönetici revizesi bloğu ekler. */
export function appendAdminRevision(existing: string | null, byName: string, note: string) {
  const block = `[${revisionStamp()}] Yönetici revizesi (${byName})\n${note.trim()}`;
  return existing ? `${existing}${REVISION_SEPARATOR}${block}` : block;
}

/** Kartta en son revize öne çıkarılır; öncekiler "eski revize" olarak küçük ve soluk gösterilir. */
export function splitRevisionBlocks(note: string | null | undefined) {
  const blocks = parseRevisionBlocks(note);
  return { latest: blocks.length ? blocks[blocks.length - 1] : null, older: blocks.slice(0, -1).reverse() };
}

export function parseRevisionBlocks(note: string | null | undefined): RevisionBlock[] {
  if (!note) return [];
  return note
    .split(/\n*─{5,}\n*/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const [first, ...rest] = raw.split("\n");
      const m = /^\[[^\]]+\]\s+(Müşteri|Yönetici) revizesi/.exec(first);
      if (!m) return { source: "ADMIN" as const, header: null, body: raw };
      return { source: m[1] === "Müşteri" ? ("CLIENT" as const) : ("ADMIN" as const), header: first, body: rest.join("\n").trim() };
    });
}

/** En son revizenin kaynağı (rozet için); not yoksa null. */
export function lastRevisionSource(note: string | null | undefined): RevisionSource | null {
  const blocks = parseRevisionBlocks(note);
  return blocks.length ? blocks[blocks.length - 1].source : null;
}

export const REVISION_SOURCE_LABEL: Record<RevisionSource, string> = { CLIENT: "Müşteri revizesi", ADMIN: "Yönetici revizesi" };

/** En son revizeyi kim verdi: yönetici revizesinde başlıktaki ad, müşteri revizesinde "Müşteri"; bilinmiyorsa null. */
export function lastRevisionBy(note: string | null | undefined): string | null {
  const blocks = parseRevisionBlocks(note);
  const last = blocks[blocks.length - 1];
  if (!last?.header) return null;
  if (last.source === "CLIENT") return "Müşteri";
  return /Yönetici revizesi \(([^)]+)\)/.exec(last.header)?.[1]?.trim() || null;
}

/** Rozet metni: "Yönetici revizesi · Ad" / "Müşteri revizesi". */
export function lastRevisionLabel(note: string | null | undefined): string | null {
  const source = lastRevisionSource(note);
  if (!source) return null;
  const by = source === "ADMIN" ? lastRevisionBy(note) : null;
  return by ? `${REVISION_SOURCE_LABEL[source]} · ${by}` : REVISION_SOURCE_LABEL[source];
}
