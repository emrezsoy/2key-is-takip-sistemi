// Admin "AI maliyeti" ekranının verisi: toplam / müşteri / model bazında AI harcaması (DmAiUsage), sağlayıcı sağlığı,
// yüklenen bakiyeden tahmini kalan ve dolar kuru.
import { prisma } from "@/lib/prisma";
import { aiKeyStatus, getAiPrices } from "@/lib/dm/ai/settings";
import { AI_PROVIDERS, loadProviderHealth, type RealProvider } from "@/lib/dm/ai/health";

const BALANCES_KEY = "dm_ai_balances";
const USD_TRY_KEY = "dm_usd_try";

export type ProviderBalance = { amountUsd: number; since: string /* YYYY-MM-DD */ };

export async function getAiBalances(): Promise<Partial<Record<RealProvider, ProviderBalance>>> {
  const row = await prisma.integrationSetting.findUnique({ where: { key: BALANCES_KEY } });
  return row ? (JSON.parse(row.value) as Partial<Record<RealProvider, ProviderBalance>>) : {};
}

export async function setAiBalance(provider: RealProvider, balance: ProviderBalance | null) {
  const all = await getAiBalances();
  if (balance) all[provider] = balance;
  else delete all[provider];
  const value = JSON.stringify(all);
  await prisma.integrationSetting.upsert({ where: { key: BALANCES_KEY }, create: { key: BALANCES_KEY, value }, update: { value } });
}

export async function getUsdTry(): Promise<number | null> {
  const row = await prisma.integrationSetting.findUnique({ where: { key: USD_TRY_KEY } });
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function setUsdTry(rate: number | null) {
  if (!rate) {
    await prisma.integrationSetting.deleteMany({ where: { key: USD_TRY_KEY } });
    return;
  }
  await prisma.integrationSetting.upsert({ where: { key: USD_TRY_KEY }, create: { key: USD_TRY_KEY, value: String(rate) }, update: { value: String(rate) } });
}

// Türkiye saati (UTC+3, yaz saati yok).
const TR_OFFSET = 3 * 60 * 60 * 1000;
const trMidnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - TR_OFFSET);

export const COST_RANGES = [
  { id: "bu-ay", label: "Bu ay" },
  { id: "gecen-ay", label: "Geçen ay" },
  { id: "7g", label: "Son 7 gün" },
  { id: "30g", label: "Son 30 gün" },
  { id: "90g", label: "Son 90 gün" },
] as const;
export type CostRange = (typeof COST_RANGES)[number]["id"];

export function rangeBounds(range: CostRange, now = new Date()) {
  const tr = new Date(now.getTime() + TR_OFFSET);
  const y = tr.getUTCFullYear();
  const m = tr.getUTCMonth();
  const today = trMidnight(y, m, tr.getUTCDate());
  const DAY = 24 * 60 * 60 * 1000;
  switch (range) {
    case "gecen-ay":
      return { from: trMidnight(y, m - 1, 1), to: trMidnight(y, m, 1) };
    case "7g":
      return { from: new Date(today.getTime() - 6 * DAY), to: now };
    case "30g":
      return { from: new Date(today.getTime() - 29 * DAY), to: now };
    case "90g":
      return { from: new Date(today.getTime() - 89 * DAY), to: now };
    default:
      return { from: trMidnight(y, m, 1), to: now };
  }
}

const num = (v: unknown) => (v == null ? 0 : Number(v));

export type ModelRow = { ref: string; provider: string; model: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number; priced: boolean };
export type ClientRow = { clientId: string | null; name: string; calls: number; costUsd: number; creditsUsed: number; models: ModelRow[] };

export async function loadAiCost(range: CostRange) {
  const { from, to } = rangeBounds(range);
  const span = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - span);
  const where = { createdAt: { gte: from, lt: to } };

  const [grouped, prev, daily, kinds, failures, recentFailures, credits, keys, prices, balances, usdTry] = await Promise.all([
    prisma.dmAiUsage.groupBy({
      by: ["clientId", "provider", "model"],
      where,
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
    }),
    prisma.dmAiUsage.aggregate({ where: { createdAt: { gte: prevFrom, lt: from } }, _sum: { costUsd: true } }),
    prisma.$queryRaw<{ day: Date; cost: unknown; calls: bigint }[]>`
      SELECT date_trunc('day', "createdAt" + interval '3 hours') AS day, SUM("costUsd") AS cost, COUNT(*) AS calls
      FROM "DmAiUsage" WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY 1 ORDER BY 1`,
    prisma.dmAiUsage.groupBy({ by: ["kind"], where, _sum: { costUsd: true }, _count: { _all: true } }),
    prisma.dmAiFailure.groupBy({ by: ["provider", "code"], where, _count: { _all: true } }),
    prisma.dmAiFailure.findMany({ where, orderBy: { createdAt: "desc" }, take: 15 }),
    prisma.dmCreditLedger.groupBy({ by: ["clientId"], where: { ...where, type: "USAGE" }, _sum: { amount: true } }),
    aiKeyStatus(),
    getAiPrices(),
    getAiBalances(),
    getUsdTry(),
  ]);

  const clientIds = [...new Set(grouped.map((g) => g.clientId).filter((x): x is string => !!x))];
  const failureClientIds = recentFailures.map((f) => f.clientId).filter((x): x is string => !!x);
  const clients = await prisma.client.findMany({ where: { id: { in: [...new Set([...clientIds, ...failureClientIds])] } }, select: { id: true, name: true } });
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const creditsUsed = new Map(credits.map((c) => [c.clientId, -num(c._sum.amount)]));

  const toModelRow = (g: (typeof grouped)[number]): ModelRow => {
    const ref = `${g.provider}:${g.model}`;
    return {
      ref,
      provider: g.provider,
      model: g.model,
      calls: g._count._all,
      inputTokens: num(g._sum.inputTokens),
      outputTokens: num(g._sum.outputTokens),
      costUsd: num(g._sum.costUsd),
      priced: g.provider === "fake" || !!prices[ref],
    };
  };

  // Model bazında (tüm müşteriler)
  const byModelMap = new Map<string, ModelRow>();
  for (const g of grouped) {
    const r = toModelRow(g);
    const cur = byModelMap.get(r.ref);
    if (!cur) byModelMap.set(r.ref, { ...r });
    else {
      cur.calls += r.calls;
      cur.inputTokens += r.inputTokens;
      cur.outputTokens += r.outputTokens;
      cur.costUsd += r.costUsd;
    }
  }
  const byModel = [...byModelMap.values()].sort((a, b) => b.costUsd - a.costUsd);

  // Müşteri bazında, içinde model kırılımı
  const byClientMap = new Map<string, ClientRow>();
  for (const g of grouped) {
    const key = g.clientId ?? "";
    let row = byClientMap.get(key);
    if (!row) {
      row = {
        clientId: g.clientId,
        name: g.clientId ? (clientName.get(g.clientId) ?? "Silinmiş müşteri") : "Sistem / test (müşterisiz)",
        calls: 0,
        costUsd: 0,
        creditsUsed: g.clientId ? (creditsUsed.get(g.clientId) ?? 0) : 0,
        models: [],
      };
      byClientMap.set(key, row);
    }
    const m = toModelRow(g);
    row.calls += m.calls;
    row.costUsd += m.costUsd;
    row.models.push(m);
  }
  const byClient = [...byClientMap.values()].sort((a, b) => b.costUsd - a.costUsd);
  for (const c of byClient) c.models.sort((a, b) => b.costUsd - a.costUsd);

  const totalUsd = byModel.reduce((a, r) => a + r.costUsd, 0);
  const totalCalls = byModel.reduce((a, r) => a + r.calls, 0);
  const totalIn = byModel.reduce((a, r) => a + r.inputTokens, 0);
  const totalOut = byModel.reduce((a, r) => a + r.outputTokens, 0);

  // Bu ay seçiliyse ay sonu tahmini
  let projectedUsd: number | null = null;
  if (range === "bu-ay") {
    const tr = new Date(Date.now() + TR_OFFSET);
    const daysInMonth = new Date(Date.UTC(tr.getUTCFullYear(), tr.getUTCMonth() + 1, 0)).getUTCDate();
    const elapsed = Math.max(1, (Date.now() - from.getTime()) / (24 * 60 * 60 * 1000));
    projectedUsd = (totalUsd / elapsed) * daysInMonth;
  }

  // Yüklenen bakiyeden tahmini kalan
  const health = await loadProviderHealth(keys);
  const balanceRows = await Promise.all(
    AI_PROVIDERS.map(async (provider) => {
      const b = balances[provider];
      if (!b) return { provider, balance: null, spentUsd: 0, remainingUsd: null as number | null };
      const since = new Date(`${b.since}T00:00:00+03:00`);
      const s = await prisma.dmAiUsage.aggregate({ where: { provider, createdAt: { gte: since } }, _sum: { costUsd: true } });
      const spentUsd = num(s._sum.costUsd);
      return { provider, balance: b, spentUsd, remainingUsd: b.amountUsd - spentUsd };
    }),
  );

  return {
    range,
    from,
    to,
    totalUsd,
    prevUsd: num(prev._sum.costUsd),
    projectedUsd,
    totalCalls,
    totalIn,
    totalOut,
    daily: daily.map((d) => ({ day: d.day, costUsd: num(d.cost), calls: Number(d.calls) })),
    byKind: kinds.map((k) => ({ kind: k.kind, calls: k._count._all, costUsd: num(k._sum.costUsd) })).sort((a, b) => b.costUsd - a.costUsd),
    byModel,
    byClient,
    failures: failures.map((f) => ({ provider: f.provider, code: f.code, count: f._count._all })),
    recentFailures: recentFailures.map((f) => ({ ...f, clientName: f.clientId ? (clientName.get(f.clientId) ?? null) : null })),
    health,
    balances: balanceRows,
    prices,
    usdTry,
  };
}

/** Genel bakış ekranı için: ödeme / anahtar sorunu olan sağlayıcılar ve bakiyesi azalanlar. */
export async function loadAiAlerts() {
  const [keys, balances] = await Promise.all([aiKeyStatus(), getAiBalances()]);
  const health = await loadProviderHealth(keys);
  const problems = health.filter((h) => h.status === "problem");
  const low: { provider: RealProvider; remainingUsd: number }[] = [];
  for (const provider of AI_PROVIDERS) {
    const b = balances[provider];
    if (!b) continue;
    const s = await prisma.dmAiUsage.aggregate({ where: { provider, createdAt: { gte: new Date(`${b.since}T00:00:00+03:00`) } }, _sum: { costUsd: true } });
    const remainingUsd = b.amountUsd - num(s._sum.costUsd);
    if (remainingUsd < Math.max(5, b.amountUsd * 0.2)) low.push({ provider, remainingUsd });
  }
  return { problems, low };
}
