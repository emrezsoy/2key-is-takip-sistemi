import { prisma } from "@/lib/prisma";
import { FIXED_EXPENSES_START, monthIndex, round2, type FixedLine } from "@/lib/finance";

export type FixedMonth = { lines: FixedLine[]; skipped: FixedLine[] };

/** İstanbul saatine göre içinde bulunulan ayın monthIndex'i. */
export function currentMonthIndex(now = new Date()) {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  return monthIndex(y, m);
}

const fromIndex = (idx: number) => ({ year: Math.floor((idx - 1) / 12), month: ((idx - 1) % 12) + 1 });
const sameKey = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLocaleLowerCase("tr-TR") === (b ?? "").trim().toLocaleLowerCase("tr-TR");

/** Aktif "aylık düzenli" gelir serilerini, içinde bulunulan aydan bir sonraki aya
 * kadar doldurur (ör. Kasım'dayken Aralık kaydı da oluşur). Her yeni ay, serinin
 * en son kaydının kopyasıdır (tutar, hizmet, fatura durumu); tahsilat "Bekliyor".
 * Geçmiş aylara geriye dönük kayıt üretilmez; o ayda aynı firma + hizmet için
 * zaten bir kayıt varsa o ay atlanır (çift kayıt olmasın). */
export async function ensureRecurringIncomes() {
  const nowIdx = currentMonthIndex();
  const horizon = nowIdx + 1;
  const series = await prisma.incomeSeries.findMany({
    where: { active: true, lastIndex: { lt: horizon } },
    include: { incomes: true },
  });
  let created = 0;
  for (const s of series) {
    const latest = [...s.incomes].sort((a, b) => monthIndex(b.year, b.month) - monthIndex(a.year, a.month))[0];
    if (!latest) {
      await prisma.incomeSeries.update({ where: { id: s.id }, data: { active: false } });
      continue;
    }
    // Geçmiş aylar doldurulmaz: en erken içinde bulunulan ay.
    const start = Math.max(s.lastIndex, monthIndex(latest.year, latest.month), nowIdx - 1) + 1;
    for (let idx = start; idx <= horizon; idx++) {
      const { year, month } = fromIndex(idx);
      const existing = await prisma.income.findMany({
        where: { year, month },
        select: { clientName: true, service: true, seriesId: true, note: true },
      });
      // Önceki aydan aktarılmış (ödenmemiş) kayıt o ayın düzenli kaydının yerine geçmez.
      const dup = existing.some(
        (e) =>
          e.seriesId === s.id ||
          (!(e.note ?? "").includes("ayından aktarıldı") && sameKey(e.clientName, latest.clientName) && sameKey(e.service, latest.service))
      );
      if (dup) continue;
      await prisma.income.create({
        data: {
          year,
          month,
          clientId: latest.clientId,
          clientName: latest.clientName,
          service: latest.service,
          amount: latest.amount,
          invoiced: latest.invoiced,
          note: latest.note?.replace(/\s*·?\s*\S+ \d{4} ayından aktarıldı/g, "").trim() || null,
          seriesId: s.id,
        },
      });
      created++;
    }
    await prisma.incomeSeries.update({ where: { id: s.id }, data: { lastIndex: horizon } });
  }
  return created;
}

/** Bir yılın 12 ayı için sabit gider satırlarını hesaplar.
 *
 * - Şablonlar (kira, muhasebe...) başladıkları aydan itibaren her aya devreder;
 *   tek bir ay için kaldırılanlar `skipped` listesine düşer.
 * - Çalışanlar puantajdan gelir (aylık net ücretliler sabit ücret, günlük
 *   ücretliler gün x günlük ücret — Puantaj sayfasıyla aynı mantık). Sadece
 *   FIXED_EXPENSES_START ve sonrası aylarda, çalışanın eklendiği aydan itibaren çıkar. */
export async function computeFixedYear(year: number): Promise<FixedMonth[]> {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const [templates, skips, payrollSkips, employees] = await Promise.all([
    prisma.fixedExpense.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.fixedExpenseSkip.findMany({ where: { year } }),
    prisma.payrollSkip.findMany({ where: { year } }),
    prisma.user.findMany({
      where: { isActive: true, isDeleted: false, role: { in: ["EMPLOYEE", "SUPERVISOR"] } },
      select: {
        id: true,
        fullName: true,
        paymentType: true,
        dailyRate: true,
        monthlyRate: true,
        createdAt: true,
      },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const attendance = await prisma.attendance.findMany({
    where: {
      userId: { in: employees.map((e) => e.id) },
      date: { gte: yearStart, lt: yearEnd },
    },
    select: { userId: true, date: true, dayType: true },
  });

  // userId -> ay -> çalışılan gün
  const daysByUserMonth = new Map<string, number>();
  for (const a of attendance) {
    const weight = a.dayType === "FULL" ? 1 : a.dayType === "HALF" ? 0.5 : 0;
    if (!weight) continue;
    const key = `${a.userId}:${a.date.getUTCMonth() + 1}`;
    daysByUserMonth.set(key, (daysByUserMonth.get(key) ?? 0) + weight);
  }

  const templateSkips = new Set(skips.map((s) => `${s.fixedExpenseId}:${s.month}`));
  const employeeSkips = new Set(payrollSkips.map((s) => `${s.userId}:${s.month}`));
  const startIdx = monthIndex(FIXED_EXPENSES_START.year, FIXED_EXPENSES_START.month);

  return Array.from({ length: 12 }, (_, idx) => {
    const month = idx + 1;
    const cur = monthIndex(year, month);
    const lines: FixedLine[] = [];
    const skipped: FixedLine[] = [];

    for (const t of templates) {
      const from = monthIndex(t.fromYear, t.fromMonth);
      const end = t.endYear && t.endMonth ? monthIndex(t.endYear, t.endMonth) : Infinity;
      if (cur < from || cur > end) continue;

      const unitPrice = Number(t.unitPrice);
      const line: FixedLine = {
        key: `t:${t.id}`,
        kind: "template",
        refId: t.id,
        label: t.label,
        unitPrice,
        quantity: t.quantity,
        total: round2(unitPrice * t.quantity),
        note: t.note,
      };
      (templateSkips.has(`${t.id}:${month}`) ? skipped : lines).push(line);
    }

    if (cur >= startIdx) {
      for (const e of employees) {
        if (monthIndex(e.createdAt.getFullYear(), e.createdAt.getMonth() + 1) > cur) continue;

        const days = daysByUserMonth.get(`${e.id}:${month}`) ?? 0;
        const monthly = e.paymentType === "MONTHLY";
        const payout = round2(monthly ? Number(e.monthlyRate ?? 0) : days * Number(e.dailyRate ?? 0));
        const line: FixedLine = {
          key: `e:${e.id}`,
          kind: "employee",
          refId: e.id,
          label: e.fullName,
          unitPrice: payout,
          quantity: 1,
          total: payout,
          note: monthly ? "Aylık net ücret" : `${days} gün x günlük ücret`,
        };
        (employeeSkips.has(`${e.id}:${month}`) ? skipped : lines).push(line);
      }
    }

    return { lines, skipped };
  });
}
