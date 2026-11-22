import { Heart, MessageCircle, Bookmark, Share2, Eye, Film, Image as ImageIcon } from "lucide-react";
import type { SocialMediaRow, SocialPoint, SocialReportData } from "@/lib/socialData";

const nf = new Intl.NumberFormat("tr-TR");
const shortDate = (iso: string) => `${Number(iso.slice(8))}.${iso.slice(5, 7)}`;

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
      <p className="text-xs text-(--color-text-muted)">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${tone ?? ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-(--color-text-muted)">{sub}</p>}
    </div>
  );
}

/** Takipçi çizgisi: kayıtlı günleri birleştirir (kayıt olmayan günler atlanır). */
function FollowersLine({ points }: { points: SocialPoint[] }) {
  const pts = points.filter((p) => p.followers !== null) as (SocialPoint & { followers: number })[];
  if (pts.length < 2) {
    return (
      <p className="py-8 text-center text-xs text-(--color-text-muted)">
        Takipçi grafiği birkaç günlük kayıt biriktikten sonra çizilir (her gün otomatik kaydedilir).
      </p>
    );
  }
  const W = 600;
  const H = 160;
  const pad = 6;
  const vals = pts.map((p) => p.followers);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const idx = new Map(points.map((p, i) => [p.date, i]));
  const x = (d: string) => pad + ((idx.get(d) ?? 0) / Math.max(1, points.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date).toFixed(1)},${y(p.followers).toFixed(1)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" preserveAspectRatio="none" role="img" aria-label="Takipçi sayısı grafiği">
        <path d={d} fill="none" stroke="currentColor" strokeWidth={2} className="text-brand-600" vectorEffect="non-scaling-stroke" />
        {pts.map((p) => (
          <circle key={p.date} cx={x(p.date)} cy={y(p.followers)} r={3} className="fill-brand-600">
            <title>{`${shortDate(p.date)}: ${nf.format(p.followers)} takipçi`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-(--color-text-muted)">
        <span>{shortDate(points[0].date)}</span>
        <span>
          {nf.format(min)} – {nf.format(max)}
        </span>
        <span>{shortDate(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}

function Bars({ title, points, pick, barClass }: { title: string; points: SocialPoint[]; pick: (p: SocialPoint) => number | null; barClass: string }) {
  const values = points.map((p) => pick(p) ?? 0);
  const max = Math.max(1, ...values);
  const total = values.reduce((s, v) => s + v, 0);
  return (
    <section className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold">{title}</h3>
        <span className="text-xs text-(--color-text-muted)">Toplam {nf.format(total)}</span>
      </div>
      <div className="mt-3 flex h-24 items-end gap-px">
        {points.map((p, i) => {
          const v = values[i];
          return (
            <div key={p.date} className="group relative flex h-full min-w-px flex-1 items-end" title={`${shortDate(p.date)}: ${nf.format(v)}`}>
              <div className={`w-full rounded-t-sm ${barClass} ${v === 0 ? "opacity-20" : ""}`} style={{ height: `${Math.max(v === 0 ? 2 : 4, (v / max) * 100)}%` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-(--color-text-muted)">
        <span>{shortDate(points[0].date)}</span>
        <span>{shortDate(points[points.length - 1].date)}</span>
      </div>
    </section>
  );
}

const typeLabel = (m: SocialMediaRow) =>
  m.product === "REELS" ? "Reels" : m.mediaType === "CAROUSEL_ALBUM" ? "Kaydırmalı" : m.mediaType === "VIDEO" ? "Video" : "Gönderi";

function MediaList({ media }: { media: SocialMediaRow[] }) {
  if (media.length === 0) {
    return <p className="rounded-xl border border-dashed border-(--color-border) py-8 text-center text-sm text-(--color-text-muted)">Bu dönemde gönderi yok.</p>;
  }
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {media.map((m) => (
        <li key={m.id} className="flex gap-3 rounded-xl border border-(--color-border) bg-(--color-surface) p-3">
          {m.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-(--color-surface-muted) text-(--color-text-muted)">
              {m.mediaType === "VIDEO" ? <Film size={20} /> : <ImageIcon size={20} />}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-(--color-text-muted)">
              {typeLabel(m)} · {m.postedAt.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short" })}
              {m.permalink && (
                <>
                  {" · "}
                  <a href={m.permalink} target="_blank" rel="noreferrer" className="font-semibold text-brand-600 hover:underline">
                    Instagram&apos;da aç
                  </a>
                </>
              )}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs">{m.caption || <span className="italic text-(--color-text-muted)">Açıklama yok</span>}</p>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-(--color-text-muted)">
              {m.reach !== null && (
                <span className="flex items-center gap-1" title="Erişim">
                  <Eye size={11} /> {nf.format(m.reach)} erişim
                </span>
              )}
              {m.views !== null && <span title="Görüntülenme">{nf.format(m.views)} izlenme</span>}
              <span className="flex items-center gap-1" title="Beğeni">
                <Heart size={11} /> {nf.format(m.likes)}
              </span>
              <span className="flex items-center gap-1" title="Yorum">
                <MessageCircle size={11} /> {nf.format(m.comments)}
              </span>
              {m.saved !== null && (
                <span className="flex items-center gap-1" title="Kaydetme">
                  <Bookmark size={11} /> {nf.format(m.saved)}
                </span>
              )}
              {m.shares !== null && (
                <span className="flex items-center gap-1" title="Paylaşım">
                  <Share2 size={11} /> {nf.format(m.shares)}
                </span>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Takipçi gelişimi + profil/erişim/etkileşim özetleri + son gönderiler (yönetici ve müşteri paneli ortak). */
export function SocialReport({ data }: { data: SocialReportData }) {
  const { totals: t } = data;
  const change = data.followerChange;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Takipçi" value={data.followersNow === null ? "—" : nf.format(data.followersNow)} sub={data.account.igUsername ? `@${data.account.igUsername}` : undefined} />
        <Kpi
          label="Takipçi değişimi"
          value={change === null ? "—" : `${change > 0 ? "+" : ""}${nf.format(change)}`}
          tone={change === null ? "" : change > 0 ? "text-emerald-600" : change < 0 ? "text-red-600" : ""}
          sub={data.historyStart ? `${shortDate(data.historyStart)} tarihinden beri kayıtlı` : "seçili dönemde"}
        />
        <Kpi label="Profil ziyareti" value={nf.format(t.profileViews)} />
        <Kpi label="Erişilen hesap" value={nf.format(t.reach)} sub="günlük toplamların toplamı" />
        <Kpi label="Etkileşim" value={nf.format(t.interactions)} sub={`${nf.format(t.engaged)} etkileşimli hesap`} />
        <Kpi label="Gönderi" value={nf.format(t.posts)} sub={t.views > 0 ? `${nf.format(t.views)} izlenme` : undefined} />
      </div>

      <section className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
        <h3 className="mb-2 text-sm font-bold">Takipçi gelişimi</h3>
        <FollowersLine points={data.points} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Bars title="Profil ziyaretleri (günlük)" points={data.points} pick={(p) => p.profileViews} barClass="bg-sky-500" />
        <Bars title="Erişilen hesaplar (günlük)" points={data.points} pick={(p) => p.reach} barClass="bg-brand-600" />
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-bold">Gönderiler</h3>
        <MediaList media={data.media} />
      </section>
    </div>
  );
}
