import { prisma } from "@/lib/prisma";
import { collectedOf, monthIndex, round2, type CollectionKey } from "@/lib/finance";

export type PaymentRow = {
  id: string;
  year: number;
  month: number;
  service: string | null;
  amount: number;
  collected: number;
  remaining: number;
  collection: CollectionKey;
  overdue: boolean;
};

export type ClientPayments = {
  rows: PaymentRow[];
  totalAmount: number;
  totalCollected: number;
  totalRemaining: number;
  overdueAmount: number;
  overdueCount: number;
};

/** İstanbul saatine göre bugünün yıl / ay / gün değeri. */
export function istanbulToday(now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" })
    .format(now)
    .split("-")
    .map(Number);
  return { year: y, month: m, day: d };
}

/** Bir gelir kalemi gecikmiş mi: geçmiş aylarda tamamı tahsil edilmediyse; cari ayda ise
 * müşteriye tanımlı "ödeme günü" geçtiyse (gün tanımlı değilse cari ay gecikmiş sayılmaz). */
export function isOverdue(
  row: { year: number; month: number; remaining: number },
  dueDay: number | null,
  today = istanbulToday()
) {
  if (row.remaining <= 0.009) return false;
  const diff = monthIndex(today.year, today.month) - monthIndex(row.year, row.month);
  if (diff > 0) return true;
  if (diff === 0) return dueDay != null && today.day > dueDay;
  return false;
}

/** Sadece bu müşterinin gelir kalemleri (iç notlar dahil edilmez). */
export async function getClientPayments(
  client: { id: string; name: string; paymentDueDay: number | null },
  limitMonths = 18
): Promise<ClientPayments> {
  const today = istanbulToday();
  const incomes = await prisma.income.findMany({
    where: { OR: [{ clientId: client.id }, { clientId: null, clientName: client.name }] },
    orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      year: true,
      month: true,
      service: true,
      amount: true,
      collection: true,
      collectedAmount: true,
    },
  });

  const all: PaymentRow[] = incomes.map((i) => {
    const amount = Number(i.amount);
    const collected = round2(
      collectedOf({ amount, collection: i.collection, collectedAmount: i.collectedAmount == null ? null : Number(i.collectedAmount) })
    );
    const remaining = round2(Math.max(amount - collected, 0));
    return {
      id: i.id,
      year: i.year,
      month: i.month,
      service: i.service,
      amount,
      collected,
      remaining,
      collection: i.collection,
      overdue: isOverdue({ year: i.year, month: i.month, remaining }, client.paymentDueDay, today),
    };
  });

  // Gelecek aylara girilmiş kalemler bakiyeyi şişirmesin: sadece cari ay ve öncesi.
  const current = monthIndex(today.year, today.month);
  const counted = all.filter((r) => monthIndex(r.year, r.month) <= current);
  const overdueRows = counted.filter((r) => r.overdue);

  return {
    rows: all.slice(0, Math.max(limitMonths * 3, 36)),
    totalAmount: round2(counted.reduce((s, r) => s + r.amount, 0)),
    totalCollected: round2(counted.reduce((s, r) => s + r.collected, 0)),
    totalRemaining: round2(counted.reduce((s, r) => s + r.remaining, 0)),
    overdueAmount: round2(overdueRows.reduce((s, r) => s + r.remaining, 0)),
    overdueCount: overdueRows.length,
  };
}
