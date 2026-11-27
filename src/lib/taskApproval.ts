import { prisma } from "@/lib/prisma";

export type ClientApproval = { at: Date | null; by: string | null };

/** Müşterinin onayladığı teslimler: işe bağlı içerik satırı ya da müşteri talebi "APPROVED" ise o iş "Müşteri onayladı" görünür.
 * Birden fazla onay varsa en yenisi alınır. */
export async function loadClientApprovals(taskIds: string[]): Promise<Map<string, ClientApproval>> {
  const out = new Map<string, ClientApproval>();
  if (taskIds.length === 0) return out;

  const where = { taskId: { in: taskIds }, deliveryStatus: "APPROVED" } as const;
  const select = { taskId: true, reviewedAt: true, reviewedByName: true } as const;
  const [items, requests] = await Promise.all([
    prisma.contentItem.findMany({ where, select }),
    prisma.clientRequest.findMany({ where, select }),
  ]);

  for (const r of [...items, ...requests]) {
    if (!r.taskId) continue;
    const prev = out.get(r.taskId);
    const prevTime = prev?.at?.getTime() ?? -1;
    const time = r.reviewedAt?.getTime() ?? 0;
    if (!prev || time >= prevTime) out.set(r.taskId, { at: r.reviewedAt, by: r.reviewedByName });
  }
  return out;
}

/** İçerik listesindeki bir satıra bağlı (oradan açılmış) işler. */
export async function loadContentLinkedTasks(taskIds: string[]): Promise<Set<string>> {
  if (taskIds.length === 0) return new Set();
  const rows = await prisma.contentItem.findMany({ where: { taskId: { in: taskIds } }, select: { taskId: true } });
  return new Set(rows.map((r) => r.taskId).filter((t): t is string => !!t));
}
