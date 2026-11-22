import Link from "next/link";
import { BarChart } from "@/components/charts/BarChart";
import type { AgencyReport } from "@/lib/reports";

const nf = new Intl.NumberFormat("tr-TR");
const pct = (v: number | null) => (v === null ? "—" : `%${Math.round(v * 100)}`);

function Kpi({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
      <p className="text-xs text-(--color-text-muted)">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone ?? ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-(--color-text-muted)">{sub}</p>}
    </div>
  );
}

function TypeBar({ design, video, other }: { design: number; video: number; other: number }) {
  const total = Math.max(1, design + video + other);
  return (
    <div className="flex h-2 w-full min-w-16 overflow-hidden rounded-full bg-(--color-surface-muted)" title={`${design} tasarım · ${video} video · ${other} diğer`}>
      <span className="bg-brand-600" style={{ width: `${(design / total) * 100}%` }} />
      <span className="bg-violet-500" style={{ width: `${(video / total) * 100}%` }} />
      <span className="bg-slate-400" style={{ width: `${(other / total) * 100}%` }} />
    </div>
  );
}

/** Ajans geneli: üretilen iş kalemleri; müşteri, çalışan ve tür kırılımı. `clientMonth` müşteri satırından o ayın raporuna bağlanır. */
export function AgencyReportView({ data, clientMonth }: { data: AgencyReport; clientMonth: string }) {
  const t = data.totals;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        <Kpi label="Üretilen iş kalemi" value={t.done} sub={`${t.clients} müşteri için`} />
        <Kpi label="Tasarım" value={t.design} tone="text-brand-600" />
        <Kpi label="Video" value={t.video} tone="text-violet-600" />
        <Kpi label="Diğer" value={t.other} sub="dosyası / türü belli olmayan" />
        <Kpi label="Müşteri revizesi" value={t.revisions} sub={`iş başına ${pct(t.revisionRate)}`} tone={t.revisions > 0 ? "text-violet-600" : ""} />
        <Kpi label="Yönetici revizesi" value={t.internalRevisions} sub={`müşteriye gitmeden · iş başına ${pct(t.internalRate)}`} tone={t.internalRevisions > 0 ? "text-amber-600" : ""} />
        <Kpi label="Şu an aktif iş" value={t.activeNow} sub="devam eden / bekleyen" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
          <h3 className="mb-3 text-sm font-bold">Aylara göre üretilen iş kalemi (son 6 ay)</h3>
          <BarChart data={data.trend} unit="iş" />
        </section>
        <section className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
          <h3 className="mb-3 text-sm font-bold">Tür dağılımı — {data.label}</h3>
          {t.done === 0 ? (
            <p className="py-6 text-center text-xs text-(--color-text-muted)">Bu dönemde tamamlanan iş yok.</p>
          ) : (
            <ul className="space-y-3">
              {[
                { label: "Tasarım", value: t.design, cls: "bg-brand-600" },
                { label: "Video", value: t.video, cls: "bg-violet-500" },
                { label: "Diğer", value: t.other, cls: "bg-slate-400" },
              ].map((r) => (
                <li key={r.label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-semibold">{r.label}</span>
                    <span className="tabular-nums text-(--color-text-muted)">
                      {r.value} · {pct(r.value / t.done)}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-(--color-surface-muted)">
                    <div className={`h-full ${r.cls}`} style={{ width: `${(r.value / t.done) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-[11px] text-(--color-text-muted)">
            Tür, işin teslim dosyalarından anlaşılır: video dosyası varsa Video, görsel varsa Tasarım; dosyası olmayan işlerde içerik tablosundaki türe bakılır.
          </p>
        </section>
      </div>

      <section className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
        <h3 className="mb-1 text-sm font-bold">Müşteriye göre — {data.label}</h3>
        <p className="mb-3 text-[11px] text-(--color-text-muted)">Müşteri revizesi: müşterinin panelden gönderdiği revize talepleri. Yönetici revizesi: sizin işlere (müşteriye gitmeden ya da sonra) verdiğiniz revizeler. Müşteri adına tıklayınca o müşterinin aylık raporu açılır.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-(--color-border) text-left text-xs text-(--color-text-muted)">
                <th className="pb-2 font-semibold">Müşteri</th>
                <th className="pb-2 text-right font-semibold">İş kalemi</th>
                <th className="w-28 pb-2 pl-4 font-semibold">Tür</th>
                <th className="pb-2 text-right font-semibold">Tasarım</th>
                <th className="pb-2 text-right font-semibold">Video</th>
                <th className="pb-2 text-right font-semibold">Müşteri rev.</th>
                <th className="pb-2 text-right font-semibold">Yönetici rev.</th>
                <th className="pb-2 text-right font-semibold">Rev./iş</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {data.byClient.map((c) => (
                <tr key={c.clientId ?? "none"}>
                  <td className="py-2 pr-2 font-medium">
                    {c.clientId ? (
                      <Link href={`/rapor?sekme=musteri&musteri=${c.clientId}&ay=${clientMonth}`} className="hover:text-brand-600 hover:underline">
                        {c.name}
                      </Link>
                    ) : (
                      c.name
                    )}
                  </td>
                  <td className="py-2 text-right font-bold tabular-nums">{c.done}</td>
                  <td className="py-2 pl-4">
                    <TypeBar design={c.design} video={c.video} other={c.other} />
                  </td>
                  <td className="py-2 text-right tabular-nums">{c.design}</td>
                  <td className="py-2 text-right tabular-nums">{c.video}</td>
                  <td className={`py-2 text-right tabular-nums ${c.revisions > 0 ? "font-semibold text-violet-600" : ""}`}>{c.revisions}</td>
                  <td className={`py-2 text-right tabular-nums ${c.internalRevisions > 0 ? "font-semibold text-amber-600" : ""}`}>{c.internalRevisions}</td>
                  <td className="py-2 text-right tabular-nums text-(--color-text-muted)" title="Müşteri / yönetici revizesi, iş başına">{pct(c.revisionRate)} / {pct(c.internalRate)}</td>
                </tr>
              ))}
              {data.byClient.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-(--color-text-muted)">
                    Bu dönemde tamamlanan iş yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
        <h3 className="mb-3 text-sm font-bold">Çalışana göre — {data.label}</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-(--color-border) text-left text-xs text-(--color-text-muted)">
                <th className="pb-2 font-semibold">Çalışan</th>
                <th className="pb-2 text-right font-semibold">İş kalemi</th>
                <th className="w-28 pb-2 pl-4 font-semibold">Tür</th>
                <th className="pb-2 text-right font-semibold">Tasarım</th>
                <th className="pb-2 text-right font-semibold">Video</th>
                <th className="pb-2 text-right font-semibold" title="Bu dönemde işlerine yönetici revizesi verilen sayı">Revize aldı</th>
                <th className="pb-2 pl-4 font-semibold">En çok çalıştığı müşteriler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {data.byEmployee.map((e) => (
                <tr key={e.userId ?? "none"}>
                  <td className="py-2 pr-2 font-medium">{e.name}</td>
                  <td className="py-2 text-right font-bold tabular-nums">{nf.format(e.done)}</td>
                  <td className="py-2 pl-4">
                    <TypeBar design={e.design} video={e.video} other={e.other} />
                  </td>
                  <td className="py-2 text-right tabular-nums">{e.design}</td>
                  <td className="py-2 text-right tabular-nums">{e.video}</td>
                  <td className={`py-2 text-right tabular-nums ${e.revised > 0 ? "font-semibold text-amber-600" : ""}`}>{e.revised}</td>
                  <td className="py-2 pl-4 text-xs text-(--color-text-muted)">{e.topClients.map((c) => `${c.name} (${c.count})`).join(", ") || "—"}</td>
                </tr>
              ))}
              {data.byEmployee.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-(--color-text-muted)">
                    Bu dönemde tamamlanan iş yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
