// Mesaj Otomasyonu kredi işlemleri (veritabanı). Tek doğru kaynak DmCreditLedger; DmConfig'teki bakiye alanları
// sadece hızlı gösterim önbelleğidir. Kurallar: creditMath.ts.
import type { DmCreditBucket, DmLedgerType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { alertLevel, approxReplies, canReply, shouldAlert, splitCharge, totalOf, type Balance } from "./creditMath";
import { subscriptionStatus } from "./periodMath";
import { getPricing, negativeLimitFor } from "./pricing";
import { notifyDm } from "./notify";

type Tx = Prisma.TransactionClient;

/** Aynı müşterinin kredi işlemleri sırayla yapılsın (eşzamanlı iki cevap bakiyeyi yanlış hesaplamasın). */
const lockClient = (tx: Tx, clientId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dm-credit:${clientId}`}))`;

export async function getBalance(clientId: string, db: Tx | typeof prisma = prisma): Promise<Balance> {
  const rows = await db.dmCreditLedger.groupBy({ by: ["bucket"], where: { clientId }, _sum: { amount: true } });
  const sum = (b: DmCreditBucket) => rows.find((r) => r.bucket === b)?._sum.amount ?? 0;
  return { plan: sum("PLAN"), permanent: sum("PERMANENT") };
}

async function ensureConfig(clientId: string, db: Tx | typeof prisma = prisma) {
  return db.dmConfig.upsert({ where: { clientId }, update: {}, create: { clientId } });
}

async function writeCache(tx: Tx, clientId: string) {
  const b = await getBalance(clientId, tx);
  await tx.dmConfig.upsert({
    where: { clientId },
    update: { planBalance: b.plan, permanentBalance: b.permanent, balanceUpdatedAt: new Date() },
    create: { clientId, planBalance: b.plan, permanentBalance: b.permanent, balanceUpdatedAt: new Date() },
  });
  return b;
}

async function periodsOf(clientId: string, db: Tx | typeof prisma = prisma) {
  return db.dmSubscriptionPeriod.findMany({ where: { clientId }, orderBy: { startDate: "asc" } });
}

/** Panelde gösterilecek kredi durumu. */
export async function creditState(clientId: string) {
  const [balance, pricing, config, periods] = await Promise.all([
    getBalance(clientId),
    getPricing(),
    ensureConfig(clientId),
    periodsOf(clientId),
  ]);
  const now = new Date();
  const sub = subscriptionStatus(periods, now, pricing.graceDays);
  return {
    balance,
    total: totalOf(balance),
    approxReplies: approxReplies(balance, pricing.textCost),
    canReply: canReply(balance),
    subscription: sub.status,
    paidThrough: sub.paidThrough,
    graceEndsAt: sub.graceEndsAt,
    monthlyCredits: sub.active?.monthlyCredits ?? null,
    negativeLimit: negativeLimitFor(pricing, config.negativeLimit),
    stoppedAt: config.stoppedAt,
  };
}

export type ChargeResult = { charged: number; balance: Balance } | { charged: 0; balance: Balance; refused: true };

/** AI cevabı / takip mesajı bedelini düşer. idempotencyKey ile aynı tur iki kez düşülmez.
 * Bakiye 0 ya da eksiyse düşmez (refused). Düşük kredi / bitti bildirimlerini gönderir. */
export async function chargeUsage(input: {
  clientId: string;
  cost: number;
  idempotencyKey: string;
  conversationId?: string;
  messageId?: string;
  note?: string;
}): Promise<ChargeResult> {
  const pricing = await getPricing();
  const result = await prisma.$transaction(async (tx) => {
    await lockClient(tx, input.clientId);
    const existing = await tx.dmCreditLedger.findFirst({ where: { idempotencyKey: { startsWith: input.idempotencyKey } } });
    if (existing) return { charged: 0, balance: await getBalance(input.clientId, tx), duplicate: true };
    const config = await ensureConfig(input.clientId, tx);
    const balance = await getBalance(input.clientId, tx);
    const periods = await periodsOf(input.clientId, tx);
    const planActive = subscriptionStatus(periods, new Date(), pricing.graceDays).active !== null;
    const split = splitCharge(balance, input.cost, negativeLimitFor(pricing, config.negativeLimit), planActive);
    if (!split) return { charged: 0, balance, refused: true };
    const base = { clientId: input.clientId, type: "USAGE" as DmLedgerType, conversationId: input.conversationId, messageId: input.messageId, note: input.note };
    if (split.fromPlan > 0) {
      await tx.dmCreditLedger.create({ data: { ...base, bucket: "PLAN", amount: -split.fromPlan, idempotencyKey: `${input.idempotencyKey}#plan` } });
    }
    if (split.fromPermanent > 0) {
      await tx.dmCreditLedger.create({ data: { ...base, bucket: "PERMANENT", amount: -split.fromPermanent, idempotencyKey: `${input.idempotencyKey}#perm` } });
    }
    return { charged: split.charged, balance: await writeCache(tx, input.clientId) };
  });
  if ("refused" in result && result.refused) return { charged: 0, balance: result.balance, refused: true };
  if (result.charged > 0) await checkLowCredit(input.clientId);
  return { charged: result.charged, balance: result.balance };
}

/** Kredi ekleme / düzeltme / iade (admin). Pozitif ya da negatif tutar. */
export async function addLedgerEntry(input: {
  clientId: string;
  type: Extract<DmLedgerType, "TOPUP" | "ADJUSTMENT" | "REFUND">;
  bucket: DmCreditBucket;
  amount: number;
  note?: string | null;
  byId?: string;
  byName?: string;
}) {
  if (!Number.isInteger(input.amount) || input.amount === 0) throw new Error("Kredi miktarı sıfırdan farklı bir tam sayı olmalı.");
  if (input.type === "TOPUP" && input.amount < 0) throw new Error("Kredi yüklemesi pozitif olmalı.");
  await prisma.$transaction(async (tx) => {
    await lockClient(tx, input.clientId);
    await tx.dmCreditLedger.create({
      data: {
        clientId: input.clientId, type: input.type, bucket: input.bucket, amount: input.amount,
        note: input.note?.trim() || null, createdById: input.byId, createdByName: input.byName,
      },
    });
    await writeCache(tx, input.clientId);
  });
  await afterBalanceIncrease(input.clientId);
}

/** Bakiye arttıysa (yükleme / aylık kredi) bildirim seviyelerini sıfırla; AI yeniden başlıyorsa duraklama bilgisini kapat. */
export async function afterBalanceIncrease(clientId: string) {
  const b = await getBalance(clientId);
  if (!canReply(b)) return;
  const pricing = await getPricing();
  const periods = await periodsOf(clientId);
  const monthly = subscriptionStatus(periods, new Date(), pricing.graceDays).active?.monthlyCredits ?? null;
  const level = alertLevel(b, monthly, pricing.lowAlertPercents);
  await prisma.dmConfig.update({
    where: { clientId },
    data: {
      emptyNotifiedAt: null,
      stoppedAt: null,
      lowAlertLevel: typeof level === "number" ? level : null,
    },
  });
}

/** Düşük kredi (%20 / %5) ve kredi bitti bildirimleri: her seviye bir kez. */
export async function checkLowCredit(clientId: string) {
  const [b, pricing, config, periods] = await Promise.all([getBalance(clientId), getPricing(), ensureConfig(clientId), periodsOf(clientId)]);
  const monthly = subscriptionStatus(periods, new Date(), pricing.graceDays).active?.monthlyCredits ?? null;
  const level = alertLevel(b, monthly, pricing.lowAlertPercents);
  if (!shouldAlert(level, config.lowAlertLevel, !!config.emptyNotifiedAt)) return;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  if (level === "EMPTY") {
    await prisma.dmConfig.update({ where: { clientId }, data: { emptyNotifiedAt: new Date(), stoppedAt: config.stoppedAt ?? new Date() } });
    await notifyDm({
      clientId, type: "DM_CREDIT_EMPTY", toClient: true, toStaff: true,
      title: "Mesaj kredisi bitti",
      message: `${client?.name ?? "Müşteri"}: kredi bittiği için AI yeni mesajlara cevap vermiyor. Mesajlar gelen kutusunda "insan bekliyor" olarak duruyor.`,
    });
  } else if (typeof level === "number") {
    await prisma.dmConfig.update({ where: { clientId }, data: { lowAlertLevel: level } });
    await notifyDm({
      clientId, type: "DM_CREDIT_LOW", toClient: true, toStaff: true,
      title: `Mesaj kredisi azaldı (%${level})`,
      message: `${client?.name ?? "Müşteri"}: kalan kredi ${totalOf(b)} (yaklaşık ${approxReplies(b, pricing.textCost)} cevap).`,
    });
  }
}
