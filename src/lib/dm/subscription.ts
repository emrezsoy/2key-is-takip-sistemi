// Abonelik dönemleri: ödeme kaydı ve zamanlayıcı (aylık kredi yükleme / silme, yenileme ve ek süre bildirimleri).
// Otomatik yenileme yoktur. Hesaplar: periodMath.ts.
import { prisma } from "@/lib/prisma";
import { addMonths, monthIndexAt, nextPeriodStart, renewalDue, subscriptionStatus } from "./periodMath";
import { getPricing } from "./pricing";
import { afterBalanceIncrease, getBalance } from "./credits";
import { dmAdminUrl, notifyDm } from "./notify";

const lock = (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], clientId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dm-credit:${clientId}`}))`;

const fmt = (d: Date) => new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" }).format(d);

/** "Ödeme alındı": paket + ay sayısı. Dönem, mevcut dönem sürüyorsa (ya da ek süredeyse) kaldığı yerden başlar.
 * İsteğe bağlı olarak Finans'a gelir kaydı açılır. İlk ayın kredisi hemen yüklenir. */
export async function recordPayment(input: {
  clientId: string;
  planId: string;
  months: number;
  note?: string | null;
  byId: string;
  byName: string;
  income?: { amount: number; invoiced: boolean } | null;
}) {
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > 36) throw new Error("Ay sayısı 1 ile 36 arasında olmalı.");
  const [plan, client, pricing, periods] = await Promise.all([
    prisma.dmPlan.findUnique({ where: { id: input.planId } }),
    prisma.client.findUnique({ where: { id: input.clientId }, select: { id: true, name: true } }),
    getPricing(),
    prisma.dmSubscriptionPeriod.findMany({ where: { clientId: input.clientId } }),
  ]);
  if (!plan) throw new Error("Paket bulunamadı.");
  if (!client) throw new Error("Müşteri bulunamadı.");
  const now = new Date();
  const startDate = nextPeriodStart(periods, now, pricing.graceDays);
  const paidThrough = addMonths(startDate, input.months);

  const period = await prisma.$transaction(async (tx) => {
    let incomeId: string | null = null;
    if (input.income && input.income.amount > 0) {
      const ym = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "numeric", timeZone: "Europe/Istanbul" }).formatToParts(now);
      const year = Number(ym.find((p) => p.type === "year")!.value);
      const month = Number(ym.find((p) => p.type === "month")!.value);
      const income = await tx.income.create({
        data: {
          year, month, clientId: client.id, clientName: client.name,
          service: `Mesaj Otomasyonu - ${plan.name} (${input.months} ay)`,
          amount: input.income.amount, invoiced: input.income.invoiced, collection: "FULL",
          note: input.note?.trim() || null,
        },
      });
      incomeId = income.id;
    }
    return tx.dmSubscriptionPeriod.create({
      data: {
        clientId: client.id, planId: plan.id, monthlyCredits: plan.monthlyCredits, startDate, months: input.months, paidThrough,
        note: input.note?.trim() || null, incomeId, createdById: input.byId, createdByName: input.byName,
      },
    });
  });
  await prisma.dmConfig.upsert({
    where: { clientId: client.id },
    update: { renewalNotifiedAt: null, graceNotifiedAt: null },
    create: { clientId: client.id },
  });
  await runCreditTickForClient(client.id, now);
  return period;
}

/** Dönem iptali (yanlış girilen ödeme). Yüklenmiş krediye dokunmaz; gerekirse düzeltme ile alınır. */
export async function cancelPeriod(periodId: string) {
  await prisma.dmSubscriptionPeriod.update({ where: { id: periodId }, data: { cancelledAt: new Date() } });
}

/** Bir müşteri için: o ayın plan kredisini yükle (önceki ayın kalanını sil), ek süre bittiyse plan kalanını sil,
 * yenileme / ek süre bildirimlerini gönder. Tekrar çalıştırılması güvenlidir (idempotencyKey). */
export async function runCreditTickForClient(clientId: string, now = new Date()) {
  const pricing = await getPricing();
  const periods = await prisma.dmSubscriptionPeriod.findMany({ where: { clientId, cancelledAt: null }, orderBy: { startDate: "asc" } });
  if (periods.length === 0) return;
  let granted = false;

  for (const p of periods) {
    const n = monthIndexAt(p, now);
    if (n === null) continue;
    const grantKey = `grant:${p.id}:${n}`;
    const done = await prisma.dmCreditLedger.findUnique({ where: { idempotencyKey: grantKey } });
    if (done) continue;
    await prisma.$transaction(async (tx) => {
      await lock(tx, clientId);
      if (await tx.dmCreditLedger.findUnique({ where: { idempotencyKey: grantKey } })) return;
      // Önceki ayın kullanılmayan plan kredisi silinir (eksi kısım silinmez: yeni yüklemeden düşer).
      const { plan } = await getBalance(clientId, tx);
      if (plan > 0) {
        await tx.dmCreditLedger.create({
          data: { clientId, type: "PLAN_EXPIRE", bucket: "PLAN", amount: -plan, periodId: p.id, idempotencyKey: `expire:${p.id}:${n}`, note: "Önceki ayın kullanılmayan paket kredisi" },
        });
      }
      await tx.dmCreditLedger.create({
        data: { clientId, type: "PLAN_GRANT", bucket: "PLAN", amount: p.monthlyCredits, periodId: p.id, idempotencyKey: grantKey, note: `${n + 1}. ay paket kredisi` },
      });
      const b = await getBalance(clientId, tx);
      await tx.dmConfig.upsert({
        where: { clientId },
        update: { planBalance: b.plan, permanentBalance: b.permanent, balanceUpdatedAt: new Date() },
        create: { clientId, planBalance: b.plan, permanentBalance: b.permanent, balanceUpdatedAt: new Date() },
      });
    });
    granted = true;
  }
  if (granted) await afterBalanceIncrease(clientId);

  const sub = subscriptionStatus(periods, now, pricing.graceDays);
  const config = await prisma.dmConfig.upsert({ where: { clientId }, update: {}, create: { clientId } });
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  const name = client?.name ?? "Müşteri";

  // Ek süre de bitti: plan kalanı silinir (kalıcı kredi kullanılmaya devam eder).
  if (sub.status === "EXPIRED" && sub.paidThrough) {
    const last = periods[periods.length - 1];
    const key = `expire-end:${last.id}`;
    if (!(await prisma.dmCreditLedger.findUnique({ where: { idempotencyKey: key } }))) {
      await prisma.$transaction(async (tx) => {
        await lock(tx, clientId);
        const { plan } = await getBalance(clientId, tx);
        await tx.dmCreditLedger.create({
          data: { clientId, type: "PLAN_EXPIRE", bucket: "PLAN", amount: plan > 0 ? -plan : 0, periodId: last.id, idempotencyKey: key, note: "Abonelik ve ek süre bitti" },
        });
      });
    }
  }

  // Dönem bitimine az kaldı: admine bir kez bildirim.
  if (sub.paidThrough && renewalDue(sub.paidThrough, now, pricing.renewalNoticeDays) && !config.renewalNotifiedAt) {
    await prisma.dmConfig.update({ where: { clientId }, data: { renewalNotifiedAt: now } });
    await notifyDm({
      clientId, type: "DM_RENEWAL_DUE", adminsOnly: true, staffUrl: dmAdminUrl(clientId, "kredi"),
      title: "Mesaj Otomasyonu yenilemesi yaklaşıyor",
      message: `${name}: ödenmiş dönem ${fmt(sub.paidThrough)} tarihinde bitiyor. Otomatik yenileme yok; ödeme alınınca "Ödeme alındı" ile girin.`,
    });
  }

  // Ek süre başladı: müşteriye ve admine bir kez "ödeme bekleniyor".
  if (sub.status === "GRACE" && sub.graceEndsAt && !config.graceNotifiedAt) {
    await prisma.dmConfig.update({ where: { clientId }, data: { graceNotifiedAt: now } });
    await notifyDm({
      clientId, type: "DM_RENEWAL_DUE", toClient: true, adminsOnly: true, staffUrl: dmAdminUrl(clientId, "kredi"),
      title: "Mesaj Otomasyonu: ödeme bekleniyor",
      message: `${name}: abonelik dönemi bitti. Ek süre ${fmt(sub.graceEndsAt)} tarihine kadar; bu tarihten sonra paket kredisi yenilenmez.`,
    });
  }
}

/** Zamanlayıcı: hizmeti açık ya da dönemi olan tüm müşteriler. */
export async function runCreditTick(now = new Date()) {
  const clients = await prisma.client.findMany({
    where: { OR: [{ dmManaged: true }, { dmPeriods: { some: {} } }] },
    select: { id: true },
  });
  for (const c of clients) {
    try {
      await runCreditTickForClient(c.id, now);
    } catch (e) {
      console.error("Kredi zamanlayıcısı hatası:", c.id, e instanceof Error ? e.message : e);
    }
  }
}
