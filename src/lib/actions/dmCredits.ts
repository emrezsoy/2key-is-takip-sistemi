"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireDmActor } from "@/lib/dm/access";
import { addLedgerEntry, creditState } from "@/lib/dm/credits";
import { cancelPeriod, recordPayment } from "@/lib/dm/subscription";
import { dmAdminUrl, notifyDm } from "@/lib/dm/notify";

async function sessionUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");
  return session.user;
}

async function requireAdmin() {
  const user = await sessionUser();
  if (user.role !== "ADMIN") throw new Error("Bu işlem için yönetici yetkisi gerekiyor.");
  return { id: user.id, name: user.name ?? user.username ?? "Yönetici" };
}

const intOf = (v: FormDataEntryValue | null, field: string, opts: { min?: number; max?: number } = {}) => {
  const n = Number(String(v ?? "").trim());
  if (!Number.isInteger(n)) throw new Error(`${field} tam sayı olmalı.`);
  if (opts.min !== undefined && n < opts.min) throw new Error(`${field} en az ${opts.min} olmalı.`);
  if (opts.max !== undefined && n > opts.max) throw new Error(`${field} en fazla ${opts.max} olmalı.`);
  return n;
};

const refresh = (clientId?: string) => {
  revalidatePath("/mesaj-otomasyonu", "layout");
  if (clientId) revalidatePath("/panel/mesajlar");
  if (clientId) revalidatePath("/mesaj", "layout");
};

/** Müşteri portal penceresi: Mesaj Otomasyonu hizmeti ve modüller (admin). */
export async function saveClientDmServices(input: {
  clientId: string;
  dmManaged: boolean;
  appointment: boolean;
  products: boolean;
  media: boolean;
}) {
  await requireAdmin();
  await prisma.client.update({
    where: { id: input.clientId },
    data: {
      dmManaged: !!input.dmManaged,
      dmModuleAppointment: !!input.appointment,
      dmModuleProducts: !!input.products,
      dmModuleMedia: !!input.media,
    },
  });
  if (input.dmManaged) await prisma.dmConfig.upsert({ where: { clientId: input.clientId }, update: {}, create: { clientId: input.clientId } });
  revalidatePath("/musteriler");
  revalidatePath("/panel", "layout");
  refresh(input.clientId);
}

/** "Ödeme alındı": paket + ay sayısı (+ isteğe bağlı Finans gelir kaydı). */
export async function recordDmPayment(clientId: string, formData: FormData) {
  const admin = await requireAdmin();
  const planId = String(formData.get("planId") ?? "");
  const monthsRaw = String(formData.get("months") ?? "");
  const months = monthsRaw === "custom" ? intOf(formData.get("customMonths"), "Ay sayısı", { min: 1, max: 36 }) : intOf(monthsRaw, "Ay sayısı", { min: 1, max: 36 });
  const withIncome = formData.get("createIncome") === "on";
  const amountRaw = String(formData.get("amount") ?? "").trim().replace(/\./g, "").replace(",", ".");
  const amount = amountRaw ? Number(amountRaw) : 0;
  if (withIncome && (!Number.isFinite(amount) || amount <= 0)) throw new Error("Finans'a gelir kaydı için tutar girin.");
  await recordPayment({
    clientId, planId, months, note: String(formData.get("note") ?? ""), byId: admin.id, byName: admin.name,
    income: withIncome ? { amount, invoiced: formData.get("invoiced") === "on" } : null,
  });
  await resolveOpenCreditRequests(clientId, admin.name);
  if (withIncome) revalidatePath("/finans");
  refresh(clientId);
}

/** Kalıcı kredi ekleme ya da düzeltme (+/-). */
export async function addDmCredit(clientId: string, formData: FormData) {
  const admin = await requireAdmin();
  const kind = String(formData.get("kind") ?? "TOPUP");
  const amount = intOf(formData.get("amount"), "Kredi miktarı", { min: -100000, max: 100000 });
  const note = String(formData.get("note") ?? "").trim();
  if (kind === "TOPUP") {
    await addLedgerEntry({ clientId, type: "TOPUP", bucket: "PERMANENT", amount, note, byId: admin.id, byName: admin.name });
    await resolveOpenCreditRequests(clientId, admin.name);
  } else if (kind === "ADJUST_PLAN" || kind === "ADJUST_PERMANENT") {
    if (!note) throw new Error("Düzeltme için bir not (sebep) yazın.");
    await addLedgerEntry({
      clientId, type: "ADJUSTMENT", bucket: kind === "ADJUST_PLAN" ? "PLAN" : "PERMANENT", amount, note, byId: admin.id, byName: admin.name,
    });
  } else if (kind === "REFUND") {
    await addLedgerEntry({ clientId, type: "REFUND", bucket: "PERMANENT", amount: Math.abs(amount), note, byId: admin.id, byName: admin.name });
  } else {
    throw new Error("Geçersiz işlem.");
  }
  refresh(clientId);
}

export async function cancelDmPeriod(periodId: string) {
  await requireAdmin();
  const p = await prisma.dmSubscriptionPeriod.findUnique({ where: { id: periodId }, select: { clientId: true } });
  if (!p) throw new Error("Dönem bulunamadı.");
  await cancelPeriod(periodId);
  refresh(p.clientId);
}

/** Paket ekle / düzenle. */
export async function saveDmPlan(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Paket adı gerekli.");
  const data = {
    name,
    monthlyCredits: intOf(formData.get("monthlyCredits"), "Aylık kredi", { min: 1, max: 1_000_000 }),
    priceNote: String(formData.get("priceNote") ?? "").trim() || null,
    isActive: formData.get("isActive") !== "off",
    sortOrder: Number(formData.get("sortOrder") ?? 0) || 0,
  };
  if (id) await prisma.dmPlan.update({ where: { id }, data });
  else await prisma.dmPlan.create({ data });
  refresh();
}

export async function setDmPlanActive(id: string, isActive: boolean) {
  await requireAdmin();
  await prisma.dmPlan.update({ where: { id }, data: { isActive } });
  refresh();
}

/** Kredi fiyatları ve genel kurallar. */
export async function saveDmPricing(formData: FormData) {
  await requireAdmin();
  const n = (k: string, label: string, max = 1000) => intOf(formData.get(k), label, { min: 0, max });
  const percents = String(formData.get("lowAlertPercents") ?? "")
    .split(/[,\s]+/)
    .map((s) => Number(s))
    .filter((x) => Number.isInteger(x) && x > 0 && x < 100);
  await prisma.dmPricing.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {
      textCost: n("textCost", "Metin cevap bedeli"),
      imageCost: n("imageCost", "Görselli cevap bedeli"),
      videoCost: n("videoCost", "Videolu cevap bedeli"),
      followUpCost: n("followUpCost", "Takip mesajı bedeli"),
      cachedMediaCost: n("cachedMediaCost", "Önbellekli medya bedeli"),
      negativeLimit: n("negativeLimit", "Eksi bakiye limiti", 100),
      graceDays: n("graceDays", "Ek süre", 60),
      renewalNoticeDays: n("renewalNoticeDays", "Yenileme bildirimi", 60),
      lowAlertPercents: percents.length > 0 ? [...new Set(percents)].sort((a, b) => b - a) : [20, 5],
    },
  });
  refresh();
}

async function resolveOpenCreditRequests(clientId: string, byName: string) {
  await prisma.dmCreditRequest.updateMany({
    where: { clientId, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedByName: byName },
  });
}

export async function resolveDmCreditRequest(id: string) {
  const admin = await requireAdmin();
  const r = await prisma.dmCreditRequest.update({ where: { id }, data: { resolvedAt: new Date(), resolvedByName: admin.name } });
  refresh(r.clientId);
}

/** Müşteri panelinden "Kredi talep et": adminlere bildirim gider, Mesaj Otomasyonu sayfasında listelenir. */
export async function requestDmCredit(clientId: string, note: string) {
  const user = await sessionUser();
  const actor = await requireDmActor(user, clientId, { allowClient: true });
  const open = await prisma.dmCreditRequest.count({ where: { clientId, resolvedAt: null } });
  if (open > 0) throw new Error("Açık bir kredi talebiniz zaten var; ekibimiz en kısa sürede dönüş yapacak.");
  await prisma.dmCreditRequest.create({
    data: { clientId, note: note.trim().slice(0, 500) || null, requestedById: actor.id, requestedByName: actor.name },
  });
  const [client, state] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { name: true } }),
    creditState(clientId),
  ]);
  await notifyDm({
    clientId, type: "DM_CREDIT_LOW", adminsOnly: true, staffUrl: dmAdminUrl(clientId, "kredi"),
    title: "Kredi talebi",
    message: `${client?.name ?? "Müşteri"} mesaj kredisi talep etti (kalan ${state.total}).${note.trim() ? ` Not: ${note.trim().slice(0, 140)}` : ""}`,
  });
  refresh(clientId);
}
