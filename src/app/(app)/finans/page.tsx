import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/permissions";
import { MONTHS, formatMoney } from "@/lib/format";
import { summarize, collectedOf } from "@/lib/finance";
import { computeFixedYear, ensureRecurringIncomes } from "@/lib/financeServer";
import { SummaryCards } from "@/components/finance/SummaryCards";
import { IncomeTable } from "@/components/finance/IncomeTable";
import { ExpenseTable } from "@/components/finance/ExpenseTable";
import { FixedExpenses } from "@/components/finance/FixedExpenses";
import { YearOverview, type YearMonthRow } from "@/components/finance/YearOverview";
import type { ExpenseRow, IncomeRow } from "@/components/finance/types";

export default async function FinansPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) redirect("/");

  const now = new Date();
  const { year: yearParam, month: monthParam } = await searchParams;
  const year = Number(yearParam) || now.getFullYear();
  const monthNum = Number(monthParam) || now.getMonth() + 1;
  const month = monthNum >= 1 && monthNum <= 12 ? monthNum : now.getMonth() + 1;

  // Aylık düzenli gelirler: içinde bulunulan aydan bir sonraki aya kadar kayıtları hazırla.
  await ensureRecurringIncomes();

  const [incomesRaw, expensesRaw, yearIncomes, yearExpenses, clients, fixedYear] =
    await Promise.all([
      prisma.income.findMany({
        where: { year, month },
        orderBy: { createdAt: "asc" },
        include: { series: { select: { active: true } } },
      }),
      prisma.expense.findMany({ where: { year, month }, orderBy: { createdAt: "asc" } }),
      prisma.income.findMany({
        where: { year },
        select: {
          month: true,
          amount: true,
          invoiced: true,
          vatOverride: true,
          collection: true,
          collectedAmount: true,
        },
      }),
      prisma.expense.findMany({
        where: { year },
        select: { month: true, unitPrice: true, quantity: true },
      }),
      prisma.client.findMany({
        where: { isActive: true },
        select: { name: true },
        orderBy: { name: "asc" },
      }),
      computeFixedYear(year),
    ]);

  const incomes: IncomeRow[] = incomesRaw.map((i) => ({
    id: i.id,
    clientName: i.clientName,
    service: i.service,
    amount: Number(i.amount),
    invoiced: i.invoiced,
    vatOverride: i.vatOverride == null ? null : Number(i.vatOverride),
    collection: i.collection,
    collectedAmount: i.collectedAmount == null ? null : Number(i.collectedAmount),
    note: i.note,
    recurring: !!i.series?.active,
  }));
  const expenses: ExpenseRow[] = expensesRaw.map((e) => ({
    id: e.id,
    label: e.label,
    unitPrice: Number(e.unitPrice),
    quantity: e.quantity,
    note: e.note,
  }));

  // Sabit giderler (şablonlar + puantajdan çalışanlar) genel giderlere eklenerek toplanır.
  const fixed = fixedYear[month - 1];
  const asExpenseLike = (l: { total: number }) => ({ unitPrice: l.total, quantity: 1 });
  const summary = summarize(incomes, [...expenses, ...fixed.lines.map(asExpenseLike)]);

  // Henüz gelmemiş aylarda projeksiyon yapılan sabit giderler yıllık özeti şişirmesin:
  // sadece geçmiş/içinde bulunulan ay ve şu an görüntülenen ay hesaba katılır.
  const nowIndex = now.getFullYear() * 12 + now.getMonth() + 1;
  const countsFixed = (m: number) => m === month || year * 12 + m <= nowIndex;

  const yearRows: YearMonthRow[] = Array.from({ length: 12 }, (_, idx) => {
    const m = idx + 1;
    return {
      month: m,
      s: summarize(
        yearIncomes
          .filter((i) => i.month === m)
          .map((i) => ({
            amount: Number(i.amount),
            invoiced: i.invoiced,
            vatOverride: i.vatOverride == null ? null : Number(i.vatOverride),
            collection: i.collection,
            collectedAmount: i.collectedAmount == null ? null : Number(i.collectedAmount),
          })),
        [
          ...yearExpenses
            .filter((e) => e.month === m)
            .map((e) => ({ unitPrice: Number(e.unitPrice), quantity: e.quantity })),
          ...(countsFixed(m) ? fixedYear[idx].lines.map(asExpenseLike) : []),
        ]
      ),
    };
  });

  // Müşteri bazında ciro (bu ay)
  const byClient = new Map<string, { total: number; collected: number }>();
  for (const i of incomes) {
    const entry = byClient.get(i.clientName) ?? { total: 0, collected: 0 };
    entry.total += i.amount;
    entry.collected += collectedOf(i);
    byClient.set(i.clientName, entry);
  }
  const clientBreakdown = [...byClient.entries()].sort((a, b) => b[1].total - a[1].total);

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Finans</h1>
          <p className="text-sm text-(--color-text-muted)">
            Aylık gelir-gider takibi, KDV, tahsilat ve ortak kar payı.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isCurrent && (
            <Link
              href="/finans"
              className="rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-medium hover:bg-(--color-surface-muted)"
            >
              Bu ay
            </Link>
          )}
          <Link
            href={`/finans?year=${prevYear}&month=${prevMonth}`}
            aria-label="Önceki ay"
            className="rounded-lg border border-(--color-border) p-2 hover:bg-(--color-surface-muted)"
          >
            <ChevronLeft size={16} />
          </Link>
          <span className="w-36 text-center text-sm font-semibold">
            {MONTHS[month - 1]} {year}
          </span>
          <Link
            href={`/finans?year=${nextYear}&month=${nextMonth}`}
            aria-label="Sonraki ay"
            className="rounded-lg border border-(--color-border) p-2 hover:bg-(--color-surface-muted)"
          >
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      <SummaryCards s={summary} />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <IncomeTable
          year={year}
          month={month}
          incomes={incomes}
          clientNames={clients.map((c) => c.name)}
        />
        <div className="space-y-6">
          <FixedExpenses
            year={year}
            month={month}
            lines={fixed.lines}
            skipped={fixed.skipped}
          />
          <ExpenseTable year={year} month={month} expenses={expenses} />

          {clientBreakdown.length > 0 && (
            <section className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
              <h2 className="mb-3 text-sm font-bold">Müşteri Bazında Ciro</h2>
              <ul className="space-y-2.5">
                {clientBreakdown.map(([name, v]) => (
                  <li key={name}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{name}</span>
                      <span className="shrink-0 tabular-nums">{formatMoney(v.total)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-(--color-surface-muted)">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${v.total > 0 ? (v.collected / v.total) * 100 : 0}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-[11px] text-(--color-text-muted)">
                      {formatMoney(v.collected)} tahsil edildi
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <YearOverview year={year} selectedMonth={month} rows={yearRows} />
    </div>
  );
}
