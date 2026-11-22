import { prisma } from "@/lib/prisma";
import { istanbulToday } from "@/lib/clientPayments";
import type { ItemRow } from "@/components/content/ContentTable";
import type { DocRow } from "@/components/content/ContentDocs";
import type { DeliveryInfo, DeliveryStatus } from "@/components/delivery/DeliveryBox";

type DeliverySource = {
  deliveryStatus: string | null;
  deliveredAt: Date | null;
  deliveredByName: string | null;
  reviewedAt: Date | null;
  reviewedByName: string | null;
  deliveryFiles: { id: string; url: string; name: string; mediaType: string }[];
};

/** Veritabanındaki teslim alanlarını ekranların kullandığı biçime çevirir (teslim yoksa null). */
export function toDeliveryInfo(d: DeliverySource): DeliveryInfo | null {
  if (!d.deliveryStatus || d.deliveryFiles.length === 0) return null;
  return {
    status: d.deliveryStatus as DeliveryStatus,
    files: d.deliveryFiles.map((f) => ({
      id: f.id,
      url: f.url,
      name: f.name,
      mediaType: f.mediaType === "VIDEO" ? "VIDEO" : "IMAGE",
    })),
    deliveredAt: d.deliveredAt?.toISOString() ?? null,
    deliveredByName: d.deliveredByName,
    reviewedAt: d.reviewedAt?.toISOString() ?? null,
    reviewedByName: d.reviewedByName,
  };
}

/** Adres parametrelerinden (y, m) ay seçimi; yoksa İstanbul'a göre cari ay. */
export function parseMonthParams(y?: string, m?: string) {
  const today = istanbulToday();
  const year = Number(y);
  const month = Number(m);
  const ok = Number.isInteger(year) && year >= 2020 && year <= 2100 && Number.isInteger(month) && month >= 1 && month <= 12;
  return ok ? { year, month } : { year: today.year, month: today.month };
}

export async function loadContent(clientId: string, year: number, month: number) {
  const [items, docs] = await Promise.all([
    prisma.contentItem.findMany({
      where: { clientId, year, month },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: {
        files: { orderBy: { position: "asc" } },
        deliveryFiles: { orderBy: { position: "asc" } },
      },
    }),
    prisma.contentDoc.findMany({ where: { clientId, year, month }, orderBy: { updatedAt: "desc" } }),
  ]);
  // "İş olarak ekle" ile açılan iş hâlâ var mı (silinmişse tekrar eklenebilsin).
  const taskIds = items.map((i) => i.taskId).filter((t): t is string => !!t);
  const liveTasks = taskIds.length > 0 ? await prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true } }) : [];
  const liveTaskIds = new Set(liveTasks.map((t) => t.id));
  const itemRows: ItemRow[] = items.map((i) => ({
    id: i.id,
    title: i.title,
    details: i.details ?? "",
    note: i.note ?? "",
    contentType: i.contentType ?? "",
    inJob: !!i.taskId && liveTaskIds.has(i.taskId),
    files: i.files.map((f) => ({ id: f.id, url: f.url, name: f.name })),
    createdByName: i.createdByName,
    delivery: toDeliveryInfo(i),
  }));
  const docRows: DocRow[] = docs.map((d) => ({
    id: d.id,
    title: d.title,
    body: d.body,
    createdByName: d.createdByName,
    updatedAt: d.updatedAt.toISOString(),
  }));
  return { items: itemRows, docs: docRows };
}

export type ContentMonth = {
  year: number;
  month: number;
  /** O aydaki tablo satırı + düz yazı sayısı. */
  count: number;
  /** Müşterinin onayını bekleyen tamamlanan iş sayısı. */
  pending: number;
};

/** Müşterinin içerik girilmiş tüm ayları (eskiden yeniye). Müşteri paneli bu ayları göstererek, ekibin önceden
 * yazdığı sonraki ayların içeriklerine de ulaşmasını sağlar. */
export async function loadContentMonths(clientId: string): Promise<ContentMonth[]> {
  const [items, docs, pending] = await Promise.all([
    prisma.contentItem.groupBy({ by: ["year", "month"], where: { clientId }, _count: { _all: true } }),
    prisma.contentDoc.groupBy({ by: ["year", "month"], where: { clientId }, _count: { _all: true } }),
    prisma.contentItem.groupBy({ by: ["year", "month"], where: { clientId, deliveryStatus: "REVIEW" }, _count: { _all: true } }),
  ]);
  const map = new Map<string, ContentMonth>();
  const row = (year: number, month: number) => {
    const key = `${year}-${month}`;
    let r = map.get(key);
    if (!r) {
      r = { year, month, count: 0, pending: 0 };
      map.set(key, r);
    }
    return r;
  };
  items.forEach((g) => (row(g.year, g.month).count += g._count._all));
  docs.forEach((g) => (row(g.year, g.month).count += g._count._all));
  pending.forEach((g) => (row(g.year, g.month).pending += g._count._all));
  return [...map.values()].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
}
