import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canViewReports } from "@/lib/permissions";
import { MONTHS } from "@/lib/format";
import { buildAgencyReport, buildClientReport, monthBounds, monthLabel } from "@/lib/reports";
import { TeamReport } from "@/components/reports/TeamReport";
import { AgencyReportView } from "@/components/reports/AgencyReportView";
import { ClientReportView } from "@/components/reports/ClientReportView";
import { PrintButton } from "@/components/reports/PrintButton";
import { AutoReportToggle, GenerateButton, ParamSelect } from "@/components/reports/ReportControls";

const pad = (n: number) => String(n).padStart(2, "0");
const ym = (y: number, m: number) => `${y}-${pad(m)}`;

/** Türkiye saatine göre bugünün yıl / ay bilgisi. */
function trNow() {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date()).split("-").map(Number);
  return { y, m };
}

/** Son 12 ay (en yeni önce). */
function lastMonths(count = 12) {
  const { y, m } = trNow();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
  });
}

function parseMonth(v: string | undefined): { y: number; m: number } | null {
  const mt = /^(\d{4})-(\d{2})$/.exec(v ?? "");
  if (!mt) return null;
  const y = Number(mt[1]);
  const m = Number(mt[2]);
  return m >= 1 && m <= 12 && y >= 2020 && y <= 2100 ? { y, m } : null;
}

export default async function RaporPage({
  searchParams,
}: {
  searchParams: Promise<{ sekme?: string; donem?: string; musteri?: string; ay?: string; userId?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !canViewReports(session.user)) redirect("/");
  const sp = await searchParams;

  // Süpervizörler: kendi ekiplerinin performans raporu (eski rapor).
  if (session.user.role !== "ADMIN") {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold">Rapor</h1>
        <TeamReport user={session.user} userId={sp.userId} />
      </div>
    );
  }

  const tab = sp.sekme === "musteri" ? "musteri" : "ajans";
  const now = trNow();
  const months = lastMonths(12);
  const prevMonth = months[1];

  const tabLink = (key: string, label: string) => (
    <Link
      href={`/rapor?sekme=${key}`}
      className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === key ? "bg-brand-600 text-white" : "border border-(--color-border) bg-(--color-surface) hover:bg-(--color-surface-muted)"}`}
    >
      {label}
    </Link>
  );

  let content: React.ReactNode;

  if (tab === "ajans") {
    // Dönem: bir ay (YYYY-MM), "3ay" (son 3 ay) ya da "yil" (bu yıl).
    const raw = sp.donem ?? ym(now.y, now.m);
    let from: Date, to: Date, label: string;
    let clientMonth = ym(prevMonth.y, prevMonth.m);
    const single = parseMonth(raw);
    if (single) {
      ({ from, to } = monthBounds(single.y, single.m));
      label = monthLabel(single.y, single.m);
      clientMonth = ym(single.y, single.m);
    } else if (raw === "3ay") {
      from = monthBounds(months[2].y, months[2].m).from;
      to = monthBounds(now.y, now.m).to;
      label = "Son 3 ay";
    } else if (raw === "yil") {
      from = monthBounds(now.y, 1).from;
      to = monthBounds(now.y + 1, 1).from;
      label = `${now.y} (yıl başından beri)`;
    } else {
      ({ from, to } = monthBounds(now.y, now.m));
      label = monthLabel(now.y, now.m);
    }
    const data = await buildAgencyReport(from, to, label);
    const options = [
      ...months.map((x) => ({ value: ym(x.y, x.m), label: monthLabel(x.y, x.m) })),
      { value: "3ay", label: "Son 3 ay" },
      { value: "yil", label: "Bu yıl" },
    ];
    content = (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-(--color-text-muted)">
            Ajansın ürettiği iş kalemleri: hangi müşteriye ne yapıldı, kim ne çıkardı, ne kadar revize geldi.
          </p>
          <ParamSelect param="donem" value={single || raw === "3ay" || raw === "yil" ? raw : ym(now.y, now.m)} options={options} base={{ sekme: "ajans" }} label="Dönem:" />
        </div>
        <AgencyReportView data={data} clientMonth={clientMonth} />
      </div>
    );
  } else {
    const clients = await prisma.client.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, autoMonthlyReport: true, autoReportSince: true },
    });
    const selected = clients.find((c) => c.id === sp.musteri) ?? clients[0] ?? null;
    const period = parseMonth(sp.ay) ?? prevMonth;
    const monthOptions = months.map((x) => ({ value: ym(x.y, x.m), label: monthLabel(x.y, x.m) }));

    const [live, stored, lastPublished] = selected
      ? await Promise.all([
          buildClientReport(selected.id, period.y, period.m),
          prisma.clientReport.findMany({ where: { clientId: selected.id }, orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }], select: { id: true, year: true, month: true, source: true, publishedAt: true, createdAt: true } }),
          prisma.clientReport.findMany({ where: { publishedAt: { not: null } }, orderBy: { publishedAt: "desc" }, select: { clientId: true, year: true, month: true, publishedAt: true } }),
        ])
      : [null, [], []];
    const lastByClient = new Map<string, { year: number; month: number; publishedAt: Date | null }>();
    for (const r of lastPublished) if (!lastByClient.has(r.clientId)) lastByClient.set(r.clientId, r);

    content = (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <ParamSelect
              param="musteri"
              value={selected?.id ?? ""}
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
              base={{ sekme: "musteri", ay: ym(period.y, period.m) }}
              label="Müşteri:"
            />
            <ParamSelect param="ay" value={ym(period.y, period.m)} options={monthOptions} base={{ sekme: "musteri", musteri: selected?.id ?? "" }} label="Ay:" />
          </div>
          {selected && (
            <div className="flex flex-wrap items-center gap-2">
              <PrintButton />
              <GenerateButton clientId={selected.id} year={period.y} month={period.m} />
            </div>
          )}
        </div>

        {live ? (
          <>
            <p className="no-print text-[11px] text-(--color-text-muted)">
              Aşağıdaki görünüm güncel verilerle hazırlanır. &quot;Rapor oluştur&quot; dersen o anki veriler kaydedilir; kaydedilen raporu inceleyip müşteriye gönderirsin.
              Reklam verisi yalnızca Meta / Google reklam yönetimi hizmeti işaretli müşterilerde, Instagram verisi ise &quot;Müşteri panelinde Gelişim olarak göster&quot; açık hesaplarda rapora girer.
            </p>
            <ClientReportView data={live} />

            {stored.length > 0 && (
              <section className="no-print rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
                <h3 className="mb-3 text-sm font-bold">{selected?.name} — kayıtlı raporlar</h3>
                <ul className="divide-y divide-(--color-border)">
                  {stored.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                      <Link href={`/rapor/kayit/${r.id}`} className="font-semibold hover:text-brand-600 hover:underline">
                        {MONTHS[r.month - 1]} {r.year}
                      </Link>
                      <span className="text-xs text-(--color-text-muted)">{r.source === "AUTO" ? "Otomatik" : "Elle oluşturuldu"}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${r.publishedAt ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"}`}>
                        {r.publishedAt
                          ? `Müşteriye gönderildi · ${r.publishedAt.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short" })}`
                          : "Taslak (müşteri görmez)"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-(--color-border) py-10 text-center text-sm text-(--color-text-muted)">Aktif müşteri yok.</p>
        )}

        <section className="no-print rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
          <h3 className="text-sm font-bold">Otomatik aylık rapor</h3>
          <p className="mb-3 mt-1 text-xs text-(--color-text-muted)">
            Açtığın müşteriler her ayın 1&apos;inde (sabah 8&apos;den sonra) bir önceki ayın raporunu kendi panellerinde otomatik görür ve bildirim alır.
            Geriye dönük rapor üretilmez: bu ay açarsan ilk rapor, bu ayın raporu olarak ayın bitiminde (sonraki ayın 1&apos;inde) gider.
          </p>
          <ul className="divide-y divide-(--color-border)">
            {clients.map((c) => {
              const last = lastByClient.get(c.id);
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <span className="text-sm font-medium">{c.name}</span>
                  <span className="flex items-center gap-4">
                    <span className="text-[11px] text-(--color-text-muted)">
                      {last ? `Son gönderilen: ${MONTHS[last.month - 1]} ${last.year}` : "Henüz rapor gönderilmedi"}
                    </span>
                    <AutoReportToggle clientId={c.id} on={c.autoMonthlyReport} />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    );
  }

  return (
    <div className="print-wrap mx-auto max-w-6xl space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Rapor</h1>
        <div className="flex gap-2">
          {tabLink("ajans", "Ajans raporu")}
          {tabLink("musteri", "Müşteri raporu")}
        </div>
      </div>
      {content}
    </div>
  );
}
