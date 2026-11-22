import { Bookmark, CheckCircle2, Eye, Film, Heart, Image as ImageIcon, MessageCircle, Share2 } from "lucide-react";
import type { AdBlock, DayPoint, PostRow, ReportData } from "@/lib/reports";

const nf = new Intl.NumberFormat("tr-TR");
const money = (n: number, cur = "TRY") =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: cur, maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n);
const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("tr-TR", { timeZone: "UTC", day: "numeric", month: "short" });
const short = (iso: string) => `${Number(iso.slice(8))}.${iso.slice(5, 7)}`;

/** Önceki aya göre yüzde değişim; `goodUp` false ise artış kırmızı sayılır (ör. maliyet). */
function Delta({ now, prev, goodUp = true }: { now: number; prev: number | null | undefined; goodUp?: boolean }) {
  if (prev === null || prev === undefined || prev <= 0) return null;
  const pct = ((now - prev) / prev) * 100;
  if (Math.abs(pct) < 0.5) return <span className="text-[11px] text-(--color-text-muted)">önceki ayla aynı</span>;
  const up = pct > 0;
  const good = up === goodUp;
  return (
    <span className={`text-[11px] font-semibold ${good ? "text-emerald-600" : "text-red-600"}`}>
      {up ? "▲" : "▼"} %{Math.abs(Math.round(pct))} <span className="font-normal text-(--color-text-muted)">önceki aya göre</span>
    </span>
  );
}

function Kpi({ label, value, sub, delta }: { label: string; value: string | number; sub?: string; delta?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
      <p className="text-xs text-(--color-text-muted)">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {delta && <p className="mt-0.5">{delta}</p>}
      {sub && <p className="mt-0.5 text-[11px] text-(--color-text-muted)">{sub}</p>}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid rounded-xl border border-(--color-border) bg-(--color-surface) p-4 sm:p-5">
      <h3 className="text-sm font-bold">{title}</h3>
      {hint && <p className="mb-3 mt-0.5 text-[11px] text-(--color-text-muted)">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}

/** Günlük sütun grafiği (a ya da b değerini çizer). */
function Bars({ title, points, pick, barClass, format }: { title: string; points: DayPoint[]; pick: (p: DayPoint) => number; barClass: string; format?: (v: number) => string }) {
  if (points.length === 0) return null;
  const values = points.map(pick);
  const max = Math.max(1, ...values);
  const total = values.reduce((s, v) => s + v, 0);
  const f = format ?? ((v: number) => nf.format(Math.round(v)));
  return (
    <div className="rounded-lg border border-(--color-border) p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold">{title}</p>
        <span className="text-[11px] text-(--color-text-muted)">Toplam {f(total)}</span>
      </div>
      <div className="mt-2 flex h-20 items-end gap-px">
        {points.map((p, i) => (
          <div key={p.date} className="flex h-full min-w-px flex-1 items-end" title={`${short(p.date)}: ${f(values[i])}`}>
            <div className={`w-full rounded-t-sm ${barClass} ${values[i] === 0 ? "opacity-20" : ""}`} style={{ height: `${Math.max(values[i] === 0 ? 2 : 4, (values[i] / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-(--color-text-muted)">
        <span>{short(points[0].date)}</span>
        <span>{short(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}

function PostCard({ p }: { p: PostRow }) {
  return (
    <li className="flex gap-3 rounded-lg border border-(--color-border) p-3">
      {p.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="h-20 w-20 shrink-0 rounded-lg bg-(--color-surface-muted) object-cover" />
      ) : (
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-(--color-surface-muted) text-(--color-text-muted)">
          {p.type === "Gönderi" ? <ImageIcon size={20} /> : <Film size={20} />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-(--color-text-muted)">
          {p.type} · {day(p.date)}
          {p.rate !== null && <span className="ml-2 font-semibold text-emerald-600">%{p.rate.toFixed(1)} etkileşim oranı</span>}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs">{p.caption ?? <span className="italic text-(--color-text-muted)">Açıklama yok</span>}</p>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-(--color-text-muted)">
          {p.reach !== null && (
            <span className="flex items-center gap-1" title="Erişim">
              <Eye size={11} /> {nf.format(p.reach)} erişim
            </span>
          )}
          {p.views !== null && p.views > 0 && <span title="Görüntülenme">{nf.format(p.views)} izlenme</span>}
          <span className="flex items-center gap-1" title="Beğeni">
            <Heart size={11} /> {nf.format(p.likes)}
          </span>
          <span className="flex items-center gap-1" title="Yorum">
            <MessageCircle size={11} /> {nf.format(p.comments)}
          </span>
          {p.saved !== null && (
            <span className="flex items-center gap-1" title="Kaydetme">
              <Bookmark size={11} /> {nf.format(p.saved)}
            </span>
          )}
          {p.shares !== null && (
            <span className="flex items-center gap-1" title="Paylaşım">
              <Share2 size={11} /> {nf.format(p.shares)}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function AdSection({ ad }: { ad: AdBlock }) {
  const cur = ad.currency;
  return (
    <Section title={`${ad.platform} reklamları`} hint={ad.platform === "Meta" ? "Facebook ve Instagram reklamları" : "Google Ads"}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Reklam harcaması" value={money(ad.spend, cur)} delta={<Delta now={ad.spend} prev={ad.prev?.spend} goodUp={false} />} />
        <Kpi
          label={ad.platform === "Meta" ? "Sonuç (mesaj, form, satın alma)" : "Dönüşüm"}
          value={nf.format(ad.results)}
          delta={<Delta now={ad.results} prev={ad.prev?.results} />}
        />
        <Kpi label="Sonuç başı maliyet" value={ad.costPerResult === null ? "—" : money(ad.costPerResult, cur)} />
        <Kpi label="Tıklama" value={nf.format(ad.clicks)} delta={<Delta now={ad.clicks} prev={ad.prev?.clicks} />} sub={ad.cpc !== null ? `tıklama başı ${money(ad.cpc, cur)}` : undefined} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Gösterim" value={nf.format(ad.impressions)} />
        <Kpi label="Tıklama oranı" value={ad.ctr === null ? "—" : `%${ad.ctr.toFixed(2)}`} />
        {ad.breakdown && (
          <>
            <Kpi label="Mesaj başlatma" value={nf.format(ad.breakdown.messages)} />
            <Kpi label="Form / satın alma" value={`${nf.format(ad.breakdown.leads)} / ${nf.format(ad.breakdown.purchases)}`} />
          </>
        )}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Bars title="Günlük harcama" points={ad.daily} pick={(p) => p.a} barClass="bg-brand-600" format={(v) => money(v, cur)} />
        <Bars title="Günlük sonuç" points={ad.daily} pick={(p) => p.b} barClass="bg-emerald-500" />
      </div>
      {ad.campaigns.length > 0 && (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-(--color-text-muted)">
              <th className="pb-1 font-semibold">Kampanya</th>
              <th className="pb-1 text-right font-semibold">Harcama</th>
              <th className="pb-1 text-right font-semibold">Tıklama</th>
              <th className="pb-1 text-right font-semibold">Sonuç</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-border)">
            {ad.campaigns.map((c, i) => (
              <tr key={i}>
                <td className="py-1.5 pr-2">{c.name}</td>
                <td className="py-1.5 text-right tabular-nums">{money(c.spend, cur)}</td>
                <td className="py-1.5 text-right tabular-nums">{nf.format(c.clicks)}</td>
                <td className="py-1.5 text-right tabular-nums">{nf.format(c.results)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

/** Müşteriye iletilen aylık rapor (yönetici önizlemesi, kayıtlı rapor ve müşteri paneli aynı görünümü kullanır). */
export function ClientReportView({ data }: { data: ReportData }) {
  const { social, meta, google, shares, work } = data;
  const ads = [meta, google].filter((a): a is AdBlock => !!a);
  const adSpend = ads.reduce((s, a) => s + a.spend, 0);
  const adResults = ads.reduce((s, a) => s + a.results, 0);
  const adCur = ads[0]?.currency ?? "TRY";
  const adPrevSpend = ads.every((a) => a.prev) ? ads.reduce((s, a) => s + (a.prev?.spend ?? 0), 0) : null;
  const adPrevResults = ads.every((a) => a.prev) ? ads.reduce((s, a) => s + (a.prev?.results ?? 0), 0) : null;
  const empty = !social && ads.length === 0 && shares.planned === 0 && work.total === 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">2 Key idea · Aylık Performans Raporu</p>
        <h2 className="mt-1 text-xl font-bold">{data.clientName}</h2>
        <p className="text-sm text-(--color-text-muted)">
          {data.label} · Hazırlanma: {new Date(data.generatedAt).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {social && (
          <>
            <Kpi
              label="Takipçi"
              value={social.followersEnd === null ? "—" : nf.format(social.followersEnd)}
              delta={
                social.change === null ? undefined : (
                  <span className={`text-[11px] font-semibold ${social.change >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {social.change > 0 ? "+" : ""}
                    {nf.format(social.change)} bu ay
                  </span>
                )
              }
              sub={social.startFromMonth && social.change !== null ? "kayıt başlangıcından itibaren" : undefined}
            />
            <Kpi label="Erişilen hesap" value={nf.format(social.reach)} delta={<Delta now={social.reach} prev={social.prev?.reach} />} />
            <Kpi label="Profil ziyareti" value={nf.format(social.profileViews)} delta={<Delta now={social.profileViews} prev={social.prev?.profileViews} />} />
            <Kpi label="Etkileşim" value={nf.format(social.interactions)} delta={<Delta now={social.interactions} prev={social.prev?.interactions} />} sub={`${nf.format(social.engagedAccounts)} etkileşimli hesap`} />
          </>
        )}
        {ads.length > 0 && (
          <>
            <Kpi label="Reklam harcaması" value={money(adSpend, adCur)} delta={<Delta now={adSpend} prev={adPrevSpend} goodUp={false} />} />
            <Kpi
              label="Dönüşüm (sonuç)"
              value={nf.format(adResults)}
              delta={<Delta now={adResults} prev={adPrevResults} />}
              sub={adResults > 0 ? `sonuç başı ${money(adSpend / adResults, adCur)}` : undefined}
            />
          </>
        )}
        <Kpi label="Paylaşılan içerik" value={`${shares.published}/${shares.planned}`} sub={`${shares.posts} post · ${shares.stories} story planlandı`} />
      </div>

      {empty && (
        <p className="rounded-xl border border-dashed border-(--color-border) py-10 text-center text-sm text-(--color-text-muted)">
          Bu ay için raporlanacak kayıt bulunmuyor.
        </p>
      )}

      {/* Instagram */}
      {social && (
        <Section title={`Instagram performansı${social.igUsername ? ` (@${social.igUsername})` : ""}`} hint="Hesabınızın ay boyunca ulaştığı kişi sayısı ve profil ilgisi">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Bars title="Günlük erişilen hesap" points={social.daily} pick={(p) => p.a} barClass="bg-brand-600" />
            <Bars title="Günlük profil ziyareti" points={social.daily} pick={(p) => p.b} barClass="bg-sky-500" />
          </div>
          {social.views > 0 && <p className="mt-3 text-xs text-(--color-text-muted)">İçeriklerin toplam görüntülenmesi: {nf.format(social.views)}</p>}
        </Section>
      )}

      {/* İçerik etkileşimi */}
      {social && social.posts.length > 0 && (
        <Section
          title={`İçeriklerin etkileşimi (${social.postCount} gönderi paylaşıldı)`}
          hint="Ayın en çok erişen içerikleri. Etkileşim oranı = (beğeni + yorum + kaydetme + paylaşım) / erişim."
        >
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {social.posts.map((p, i) => (
              <PostCard key={i} p={p} />
            ))}
          </ul>
        </Section>
      )}

      {/* Reklamlar */}
      {meta && <AdSection ad={meta} />}
      {google && <AdSection ad={google} />}

      {/* Paylaşılan içerikler */}
      {shares.planned > 0 && (
        <Section title={`Paylaşılan içerikler (${shares.published} paylaşıldı / ${shares.planned} planlandı)`} hint="Paylaşım takvimine göre">
          <ul className="divide-y divide-(--color-border)">
            {shares.items.map((s, i) => (
              <li key={i} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-14 shrink-0 text-xs tabular-nums text-(--color-text-muted)">{day(s.date)}</span>
                <span className="min-w-0 flex-1 break-words">{s.title}</span>
                <span className="shrink-0 text-[11px] text-(--color-text-muted)">{s.kind === "STORY" ? "Story" : s.kind === "REEL" ? "Reels" : "Post"}</span>
                {s.published && <CheckCircle2 size={14} className="shrink-0 text-emerald-600" aria-label="Paylaşıldı" />}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Çalışma özeti */}
      {work.total + work.revisions + work.approvals > 0 && (
        <Section title="Çalışma özeti">
          <p className="text-sm text-(--color-text-muted)">
            Bu ay sizin için <b className="text-(--color-text)">{work.total}</b> iş tamamlandı
            {work.total > 0 && ` (${work.design} tasarım, ${work.video} video${work.other ? `, ${work.other} diğer` : ""})`}.
            {work.approvals > 0 && (
              <>
                {" "}
                <b className="text-(--color-text)">{work.approvals}</b> içeriği onayladınız.
              </>
            )}
            {work.revisions > 0 && (
              <>
                {" "}
                <b className="text-(--color-text)">{work.revisions}</b> revize talebiniz işlendi.
              </>
            )}
          </p>
        </Section>
      )}
    </div>
  );
}
