import type { DayPoint } from "./stats";

const nf = new Intl.NumberFormat("tr-TR");
const tl = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });
const tlShort = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });

const shortDate = (iso: string) => `${Number(iso.slice(8))}.${iso.slice(5, 7)}`;

/** Kompakt günlük sütun grafiği: sabit yükseklik, ince sütunlar, üzerine gelince değer gösterir. */
export function BarChart({
  title,
  points,
  valueKey,
  barClass,
  money,
}: {
  title: string;
  points: DayPoint[];
  valueKey: "spend" | "clicks" | "results";
  barClass: string;
  money?: boolean;
}) {
  const values = points.map((p) => p[valueKey]);
  const max = Math.max(...values, 0);
  const total = values.reduce((s, v) => s + v, 0);
  const activeDays = values.filter((v) => v > 0).length;
  const avg = activeDays > 0 ? total / activeDays : 0;

  const full = (v: number) => (money ? tl.format(v) : nf.format(Math.round(v)));
  const axis = (v: number) => (money ? tlShort.format(v) : nf.format(Math.round(v)));

  // 5 civarı tarih etiketi (başta, sonda ve arada eşit aralıkla).
  const step = Math.max(1, Math.ceil(points.length / 5));
  const labelIdx = new Set<number>();
  for (let i = 0; i < points.length; i += step) labelIdx.add(i);
  labelIdx.add(points.length - 1);

  return (
    <section className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-bold">{title}</h3>
        <div className="text-right">
          <p className="text-base font-bold tabular-nums leading-tight">{full(total)}</p>
          {avg > 0 && (
            <p className="text-[11px] text-(--color-text-muted)">
              Aktif gün ort. {full(avg)}
            </p>
          )}
        </div>
      </div>

      {max === 0 ? (
        <p className="py-10 text-center text-sm text-(--color-text-muted)">Bu aralıkta veri yok.</p>
      ) : (
        <div className="mt-3 flex gap-2">
          <div className="flex h-32 w-12 shrink-0 flex-col justify-between text-right text-[10px] leading-none tabular-nums text-(--color-text-muted)">
            <span>{axis(max)}</span>
            <span>{axis(max / 2)}</span>
            <span>{axis(0)}</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="relative h-32">
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                <div className="border-t border-dashed border-(--color-border)" />
                <div className="border-t border-dashed border-(--color-border)" />
                <div className="border-t border-(--color-border)" />
              </div>
              <div className="relative flex h-full items-end gap-px">
                {points.map((p) => {
                  const v = p[valueKey];
                  return (
                    <div
                      key={p.date}
                      title={`${shortDate(p.date)}: ${full(v)}`}
                      className="group flex h-full min-w-0 flex-1 items-end justify-center hover:bg-(--color-surface-muted)"
                    >
                      <div
                        className={`w-full max-w-3 rounded-t-sm opacity-90 group-hover:opacity-100 ${barClass}`}
                        style={{ height: v > 0 ? `max(${(v / max) * 100}%, 2px)` : 0 }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-1 flex gap-px text-[10px] text-(--color-text-muted)">
              {points.map((p, i) => (
                <span key={p.date} className="relative min-w-0 flex-1">
                  {labelIdx.has(i) && (
                    <span
                      className={`absolute top-0 whitespace-nowrap ${
                        i === points.length - 1
                          ? "right-0"
                          : i === 0
                            ? "left-0"
                            : "left-1/2 -translate-x-1/2"
                      }`}
                    >
                      {shortDate(p.date)}
                    </span>
                  )}
                  <span className="invisible">.</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
