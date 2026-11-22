import { COMPANY_SIZES, SERVICES } from "@/lib/proposals";

export type StatRow = {
  kind: string;
  fromReport: boolean;
  status: string;
  date: string;
  companySize: string;
  services: string[];
};

type Tally = { total: number; approved: number; rejected: number; revision: number; pending: number };
const empty = (): Tally => ({ total: 0, approved: 0, rejected: 0, revision: 0, pending: 0 });
function add(t: Tally, status: string) {
  t.total += 1;
  if (status === "APPROVED") t.approved += 1;
  else if (status === "REJECTED") t.rejected += 1;
  else if (status === "REVISION") t.revision += 1;
  else t.pending += 1;
}
/** Onay oranı: sonuçlanan (onay + red) teklifler içinde onaylananlar. Sonuçlanan yoksa null. */
export const winRate = (t: Tally) => (t.approved + t.rejected > 0 ? t.approved / (t.approved + t.rejected) : null);

export function computeProposalStats(rows: StatRow[]) {
  // Teklif istatistikleri sadece teklif verilenlerden; raporlar ayrı sayılır (teklife çevrilenler dahil "verilen rapor" sayılır).
  const offers = rows.filter((r) => r.kind === "PROPOSAL");
  const reportsGiven = rows.filter((r) => r.kind === "REPORT" || r.fromReport);

  const overall = empty();
  offers.forEach((r) => add(overall, r.status));

  const byMonth = new Map<string, Tally & { reports: number }>();
  const monthOf = (d: string) => {
    const k = d.slice(0, 7);
    if (!byMonth.has(k)) byMonth.set(k, { ...empty(), reports: 0 });
    return byMonth.get(k)!;
  };
  offers.forEach((r) => add(monthOf(r.date), r.status));
  rows.forEach((r) => {
    if (r.kind === "REPORT" || r.fromReport) monthOf(r.date).reports += 1;
  });

  const byService = SERVICES.map((s) => {
    const t = empty();
    offers.filter((r) => r.services.includes(s.key)).forEach((r) => add(t, r.status));
    return { key: s.key, label: s.label, ...t };
  })
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total);

  const bySize = COMPANY_SIZES.map((s) => {
    const t = empty();
    offers.filter((r) => r.companySize === s.key).forEach((r) => add(t, r.status));
    return { key: s.key, label: s.label, ...t };
  }).filter((s) => s.total > 0);

  return {
    overall,
    reports: {
      given: reportsGiven.length,
      converted: reportsGiven.filter((r) => r.fromReport).length,
      open: rows.filter((r) => r.kind === "REPORT").length,
    },
    months: [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([key, t]) => ({ key, ...t })),
    byService,
    bySize,
  };
}
