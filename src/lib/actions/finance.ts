"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/permissions";
import { COLLECTION_NEXT, collectedOf, monthIndex, round2, type CollectionKey } from "@/lib/finance";
import { ensureRecurringIncomes } from "@/lib/financeServer";
import { MONTHS } from "@/lib/format";

const COLLECTIONS: CollectionKey[] = ["NONE", "HALF", "FULL", "PARTIAL"];

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    throw new Error("Finans bölümüne sadece yöneticiler erişebilir.");
  }
  return session.user;
}

function checkPeriod(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Geçersiz yıl.");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("Geçersiz ay.");
}

function parseMoney(raw: FormDataEntryValue | null, field: string) {
  const value = Number(String(raw ?? "").trim().replace(",", "."));
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} geçerli bir tutar olmalı.`);
  return value;
}

function parseIncomeForm(formData: FormData) {
  const clientName = String(formData.get("clientName") ?? "").trim();
  const service = String(formData.get("service") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const amount = parseMoney(formData.get("amount"), "Tutar");
  const invoiced = formData.get("invoiced") === "on";
  const vatRaw = String(formData.get("vatOverride") ?? "").trim();
  const vatOverride = invoiced && vatRaw !== "" ? parseMoney(vatRaw, "KDV tutarı") : null;
  const collectionRaw = String(formData.get("collection") ?? "NONE") as CollectionKey;
  let collection = COLLECTIONS.includes(collectionRaw) ? collectionRaw : "NONE";
  let collectedAmount: number | null = null;
  if (collection === "PARTIAL") {
    const paid = parseMoney(formData.get("collectedAmount"), "Tahsil edilen tutar");
    // Hiç ödenmediyse "bekliyor", tamamı ödendiyse "tahsil edildi" olarak kaydedilir.
    if (paid <= 0) collection = "NONE";
    else if (paid >= amount) collection = "FULL";
    else collectedAmount = paid;
  }

  if (!clientName) throw new Error("Firma / müşteri adı zorunludur.");
  if (amount <= 0) throw new Error("Tutar sıfırdan büyük olmalı.");

  return {
    data: {
      clientName,
      service: service || null,
      note: note || null,
      amount,
      invoiced,
      vatOverride,
      collection,
      collectedAmount,
    },
    recurring: formData.get("recurring") === "on",
  };
}

/** Geliri "aylık düzenli" yapar: seriye bağlar (gerekirse yeni seri açar) ve
 * sonraki ay(lar)ın kayıtlarını hemen oluşturur. */
async function startSeries(incomeId: string) {
  const income = await prisma.income.findUnique({ where: { id: incomeId }, include: { series: true } });
  if (!income) return;
  const idx = monthIndex(income.year, income.month);
  if (income.series) {
    if (!income.series.active) {
      await prisma.incomeSeries.update({
        where: { id: income.series.id },
        data: { active: true, lastIndex: Math.max(income.series.lastIndex, idx) },
      });
    }
  } else {
    const series = await prisma.incomeSeries.create({ data: { lastIndex: idx } });
    await prisma.income.update({ where: { id: incomeId }, data: { seriesId: series.id } });
  }
  await ensureRecurringIncomes();
}

/** "Aylık düzenli" işaretini kaldırır: seri durur; bu aydan SONRAKİ aylarda otomatik
 * oluşmuş ve hiç tahsilat görmemiş kayıtlar silinir. Silinen kayıt sayısını döner. */
async function stopSeries(incomeId: string) {
  const income = await prisma.income.findUnique({ where: { id: incomeId }, include: { series: { include: { incomes: true } } } });
  if (!income?.series) return 0;
  const idx = monthIndex(income.year, income.month);
  const later = income.series.incomes
    .filter((i) => monthIndex(i.year, i.month) > idx && i.collection === "NONE")
    .map((i) => i.id);
  await prisma.$transaction([
    prisma.incomeSeries.update({ where: { id: income.series.id }, data: { active: false } }),
    prisma.income.deleteMany({ where: { id: { in: later } } }),
  ]);
  return later.length;
}

/** Firma adı kayıtlı bir müşteriyle birebir eşleşiyorsa ona bağlar. */
async function findClientId(name: string) {
  const client = await prisma.client.findFirst({ where: { name }, select: { id: true } });
  return client?.id ?? null;
}

export async function addIncome(year: number, month: number, formData: FormData) {
  await requireAdmin();
  checkPeriod(year, month);
  const { data, recurring } = parseIncomeForm(formData);
  const income = await prisma.income.create({
    data: { year, month, ...data, clientId: await findClientId(data.clientName) },
  });
  if (recurring) await startSeries(income.id);
  revalidatePath("/finans");
}

export async function updateIncome(id: string, formData: FormData) {
  await requireAdmin();
  const { data, recurring } = parseIncomeForm(formData);
  const before = await prisma.income.findUnique({ where: { id }, include: { series: true } });
  if (!before) throw new Error("Kayıt bulunamadı.");
  await prisma.income.update({
    where: { id },
    data: { ...data, clientId: await findClientId(data.clientName) },
  });
  const wasRecurring = !!before.series?.active;
  if (recurring && !wasRecurring) await startSeries(id);
  else if (!recurring && wasRecurring) await stopSeries(id);
  revalidatePath("/finans");
}

export type MoveIncomeResult = { ok: true; moved: number; split: number; skipped: number } | { ok: false; error: string };

/** Seçili gelirleri sonraki aya aktarır.
 * - Hiç tahsil edilmemiş gelir olduğu gibi sonraki aya taşınır.
 * - Kısmen tahsil edilmiş (yarısı / kısmi) gelir bölünür: tahsil edilen kısım bu ayda
 *   "Tahsil edildi" olarak kalır, kalan tutar sonraki aya "Bekliyor" olarak geçer.
 * - Tamamı tahsil edilmiş gelirler aktarılmaz.
 * Aktarılan kayıt tek seferliktir: aylık düzenli seriden ayrılır (seri kendi kaydını üretmeye devam eder). */
export async function moveIncomesToNextMonth(ids: string[], year: number, month: number): Promise<MoveIncomeResult> {
  try {
    await requireAdmin();
    checkPeriod(year, month);
    if (!Array.isArray(ids) || ids.length === 0) return { ok: false, error: "Aktarılacak gelir seçin." };
    // Düzenli gelirin sonraki ay kaydı aktarmadan önce oluşsun; aktarılan kayıt seriden ayrılınca seri durmasın.
    await ensureRecurringIncomes();
    const next =month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    const tag = `${MONTHS[month - 1]} ${year} ayından aktarıldı`;
    const withTag = (note: string | null) => (note ? `${note} · ${tag}` : tag);
    const incomes = await prisma.income.findMany({ where: { id: { in: ids }, year, month } });
    let moved = 0;
    let split = 0;
    let skipped = 0;
    for (const i of incomes) {
      if (i.collection === "FULL") {
        skipped++;
        continue;
      }
      const amount = Number(i.amount);
      if (i.collection === "NONE") {
        await prisma.income.update({
          where: { id: i.id },
          data: { year: next.year, month: next.month, seriesId: null, note: withTag(i.note) },
        });
        moved++;
        continue;
      }
      const paid = collectedOf({ amount, collection: i.collection, collectedAmount: i.collectedAmount == null ? null : Number(i.collectedAmount) });
      const rest = round2(amount - paid);
      if (rest <= 0) {
        skipped++;
        continue;
      }
      const ratio = amount > 0 ? paid / amount : 0;
      const vo = i.vatOverride == null ? null : Number(i.vatOverride);
      await prisma.$transaction([
        prisma.income.update({
          where: { id: i.id },
          data: {
            amount: round2(paid),
            collection: "FULL",
            collectedAmount: null,
            vatOverride: vo == null ? null : round2(vo * ratio),
          },
        }),
        prisma.income.create({
          data: {
            year: next.year,
            month: next.month,
            clientId: i.clientId,
            clientName: i.clientName,
            service: i.service,
            amount: rest,
            invoiced: i.invoiced,
            vatOverride: vo == null ? null : round2(vo - vo * ratio),
            note: withTag(i.note),
          },
        }),
      ]);
      split++;
    }
    revalidatePath("/finans");
    return { ok: true, moved, split, skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Aktarılamadı." };
  }
}

export async function deleteIncome(id: string) {
  await requireAdmin();
  await prisma.income.delete({ where: { id } });
  revalidatePath("/finans");
}

export async function cycleIncomeCollection(id: string) {
  await requireAdmin();
  const income = await prisma.income.findUnique({ where: { id } });
  if (!income) throw new Error("Kayıt bulunamadı.");
  await prisma.income.update({
    where: { id },
    data: { collection: COLLECTION_NEXT[income.collection], collectedAmount: null },
  });
  revalidatePath("/finans");
}

export async function toggleIncomeInvoiced(id: string) {
  await requireAdmin();
  const income = await prisma.income.findUnique({ where: { id } });
  if (!income) throw new Error("Kayıt bulunamadı.");
  await prisma.income.update({ where: { id }, data: { invoiced: !income.invoiced } });
  revalidatePath("/finans");
}

function parseExpenseForm(formData: FormData) {
  const label = String(formData.get("label") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const unitPrice = parseMoney(formData.get("unitPrice"), "Birim fiyat");
  const quantity = Math.floor(Number(formData.get("quantity") ?? 1));

  if (!label) throw new Error("Gider türü zorunludur.");
  if (!Number.isFinite(quantity) || quantity < 1) throw new Error("Adet en az 1 olmalı.");
  return { label, note: note || null, unitPrice, quantity };
}

export async function addExpense(year: number, month: number, formData: FormData) {
  await requireAdmin();
  checkPeriod(year, month);
  await prisma.expense.create({ data: { year, month, ...parseExpenseForm(formData) } });
  revalidatePath("/finans");
}

export async function updateExpense(id: string, formData: FormData) {
  await requireAdmin();
  await prisma.expense.update({ where: { id }, data: parseExpenseForm(formData) });
  revalidatePath("/finans");
}

export async function deleteExpense(id: string) {
  await requireAdmin();
  await prisma.expense.delete({ where: { id } });
  revalidatePath("/finans");
}

/** Önceki ayın gider kalemlerini (kira, muhasebe vb.) bu aya kopyalar;
 * bu ayda zaten aynı isimli kalem varsa atlar. Eklenen kalem sayısını döner. */
export async function copyExpensesFromPreviousMonth(year: number, month: number) {
  await requireAdmin();
  checkPeriod(year, month);

  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;

  const [previous, current] = await Promise.all([
    prisma.expense.findMany({ where: { year: prevYear, month: prevMonth } }),
    prisma.expense.findMany({ where: { year, month }, select: { label: true } }),
  ]);
  const existing = new Set(current.map((e) => e.label.toLocaleLowerCase("tr-TR")));
  const toCopy = previous.filter((e) => !existing.has(e.label.toLocaleLowerCase("tr-TR")));

  if (toCopy.length > 0) {
    await prisma.expense.createMany({
      data: toCopy.map((e) => ({
        year,
        month,
        label: e.label,
        unitPrice: e.unitPrice,
        quantity: e.quantity,
        note: e.note,
      })),
    });
  }

  revalidatePath("/finans");
  return toCopy.length;
}

// ---- Sabit giderler ----------------------------------------------------

const prevPeriod = (year: number, month: number) =>
  month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };

async function getTemplate(id: string) {
  const template = await prisma.fixedExpense.findUnique({ where: { id } });
  if (!template) throw new Error("Sabit gider bulunamadı.");
  return template;
}

/** Sabit gider ekler: seçili aydan itibaren her aya devreder. */
export async function addFixedExpense(year: number, month: number, formData: FormData) {
  await requireAdmin();
  checkPeriod(year, month);
  await prisma.fixedExpense.create({
    data: { fromYear: year, fromMonth: month, ...parseExpenseForm(formData) },
  });
  revalidatePath("/finans");
}

/** Sabit gideri seçili aydan itibaren günceller; önceki aylar eski tutarıyla kalır. */
export async function updateFixedExpense(id: string, year: number, month: number, formData: FormData) {
  await requireAdmin();
  checkPeriod(year, month);
  const data = parseExpenseForm(formData);
  const template = await getTemplate(id);
  const cur = monthIndex(year, month);

  if (monthIndex(template.fromYear, template.fromMonth) >= cur) {
    await prisma.fixedExpense.update({ where: { id }, data });
  } else {
    const prev = prevPeriod(year, month);
    await prisma.$transaction(async (tx) => {
      await tx.fixedExpense.update({
        where: { id },
        data: { endYear: prev.year, endMonth: prev.month },
      });
      const next = await tx.fixedExpense.create({
        data: {
          ...data,
          fromYear: year,
          fromMonth: month,
          endYear: template.endYear,
          endMonth: template.endMonth,
        },
      });
      // Sonraki aylar için "sadece o ay kaldır" kayıtları yeni sürüme taşınır.
      const laterSkips = await tx.fixedExpenseSkip.findMany({ where: { fixedExpenseId: id } });
      const moved = laterSkips.filter((s) => monthIndex(s.year, s.month) >= cur).map((s) => s.id);
      if (moved.length > 0) {
        await tx.fixedExpenseSkip.updateMany({
          where: { id: { in: moved } },
          data: { fixedExpenseId: next.id },
        });
      }
    });
  }
  revalidatePath("/finans");
}

/** Sabit gideri sadece seçili ay için kaldırır (diğer aylar etkilenmez). */
export async function skipFixedExpenseThisMonth(id: string, year: number, month: number) {
  await requireAdmin();
  checkPeriod(year, month);
  await getTemplate(id);
  await prisma.fixedExpenseSkip.upsert({
    where: { fixedExpenseId_year_month: { fixedExpenseId: id, year, month } },
    create: { fixedExpenseId: id, year, month },
    update: {},
  });
  revalidatePath("/finans");
}

/** Sabit gideri seçili aydan itibaren (o ay dahil) tamamen sonlandırır. */
export async function endFixedExpenseFromMonth(id: string, year: number, month: number) {
  await requireAdmin();
  checkPeriod(year, month);
  const template = await getTemplate(id);

  if (monthIndex(template.fromYear, template.fromMonth) >= monthIndex(year, month)) {
    await prisma.fixedExpense.delete({ where: { id } });
  } else {
    const prev = prevPeriod(year, month);
    await prisma.fixedExpense.update({
      where: { id },
      data: { endYear: prev.year, endMonth: prev.month },
    });
  }
  revalidatePath("/finans");
}

/** "Bu ay için kaldırılmış" bir sabit gideri geri getirir. */
export async function restoreFixedExpense(id: string, year: number, month: number) {
  await requireAdmin();
  checkPeriod(year, month);
  await prisma.fixedExpenseSkip.deleteMany({ where: { fixedExpenseId: id, year, month } });
  revalidatePath("/finans");
}

/** Bir çalışanın puantaj satırını sadece seçili ay için sabit giderlerden çıkarır. */
export async function skipEmployeeThisMonth(userId: string, year: number, month: number) {
  await requireAdmin();
  checkPeriod(year, month);
  await prisma.payrollSkip.upsert({
    where: { userId_year_month: { userId, year, month } },
    create: { userId, year, month },
    update: {},
  });
  revalidatePath("/finans");
}

export async function restoreEmployeeLine(userId: string, year: number, month: number) {
  await requireAdmin();
  checkPeriod(year, month);
  await prisma.payrollSkip.deleteMany({ where: { userId, year, month } });
  revalidatePath("/finans");
}
