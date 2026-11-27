import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDashed, ExternalLink, XCircle } from "lucide-react";
import { auth } from "@/auth";
import { COST_RANGES, loadAiCost, type CostRange } from "@/lib/dm/aiCost";
import { FAILURE_LABEL, type AiFailureCode, type ProviderHealth } from "@/lib/dm/ai/health";
import { cardCls, chip, fmtDateTime } from "@/components/dm/ui";
import { BalanceEditor, PriceEditor, ProviderTestButton, UsdTryEditor } from "@/components/dm/aicost/AiCostControls";

export const metadata = { title: "AI maliyeti" };

const KIND_LABEL: Record<string, string> = {
  TEXT_REPLY: "Mesaj cevabı",
  MEDIA: "Görsel / video analizi",
  CLASSIFY: "Sınıflandırma",
  SUMMARY: "Özet",
  ONBOARDING: "Sesli kurulum",
  EMBEDDING: "Ürün arama (embedding)",
  TEST: "Test",
};

const fmtUsd = (v: number) => {
  if (v === 0) return "$0";
  if (Math.abs(v) < 0.01) return `$${v.toFixed(4)}`;
  if (Math.abs(v) < 10) return `$${v.toFixed(3)}`;
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
};
const fmtTry = (v: number, rate: number | null) => (rate ? `≈ ₺${(v * rate).toLocaleString("tr-TR", { maximumFractionDigits: v * rate < 10 ? 2 : 0 })}` : null);
const fmtNum = (v: number) => v.toLocaleString("tr-TR");
const fmtTokens = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v));
const providerOf = (ref: string) => ref.split(":")[0];

const STATUS: Record<ProviderHealth["status"], { text: string; cls: string; icon: typeof CheckCircle2 }> = {
  ok: { text: "Çalışıyor", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", icon: CheckCircle2 },
  problem: { text: "Sorun var", cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300", icon: XCircle },
  warn: { text: "Son 24 saatte hata", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", icon: AlertTriangle },
  idle: { text: "Henüz kullanılmadı", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", icon: CircleDashed },
};

export default async function AiCostPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/mesaj-otomasyonu");
  const { d } = await searchParams;
  const range: CostRange = COST_RANGES.some((r) => r.id === d) ? (d as CostRange) : "bu-ay";
  const data = await loadAiCost(range);
  const rate = data.usdTry;
  const problems = data.health.filter((h) => h.status === "problem");
  const maxDay = Math.max(...data.daily.map((x) => x.costUsd), 0);
  const change = data.prevUsd > 0 ? ((data.totalUsd - data.prevUsd) / data.prevUsd) * 100 : null;
  const unpriced = data.byModel.filter((m) => !m.priced);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href="/mesaj-otomasyonu" className="inline-flex items-center gap-1 text-sm text-(--color-text-muted) hover:text-brand-600">
        <ArrowLeft size={14} /> Mesaj Otomasyonu
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">AI maliyeti</h1>
          <p className="text-sm text-(--color-text-muted)">Yapay zekâya ne kadar harcandığı: toplam, müşteri ve model bazında. API hesaplarınızın durumu.</p>
        </div>
        <UsdTryEditor rate={rate} />
      </div>

      {problems.map((p) => (
        <div key={p.provider} className="flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          <XCircle size={20} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-bold">
              {p.label}: {p.lastFailure?.code === "BILLING" ? "ödeme alınamıyor / bakiye bitmiş olabilir" : "API anahtarı çalışmıyor"}
            </p>
            <p className="mt-0.5">Bu sağlayıcıyı kullanan müşterilerde AI cevap veremiyor. Ödemeyi düzelttikten sonra aşağıdan &quot;Şimdi test et&quot;e basın.</p>
            <a href={p.billingUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold underline">
              Ödeme sayfasını aç <ExternalLink size={13} />
            </a>
          </div>
        </div>
      ))}

      {/* Sağlayıcılar */}
      <section className="grid gap-3 md:grid-cols-3">
        {data.health.map((h) => {
          const st = STATUS[h.status];
          const Icon = st.icon;
          const bal = data.balances.find((b) => b.provider === h.provider);
          const low = bal?.remainingUsd != null && bal.balance && bal.remainingUsd < Math.max(5, bal.balance.amountUsd * 0.2);
          return (
            <div key={h.provider} className={`${cardCls} space-y-2`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{h.label}</p>
                <span className={`${chip} inline-flex items-center gap-1 ${h.hasKey ? st.cls : STATUS.idle.cls}`}>
                  <Icon size={12} /> {h.hasKey ? st.text : "Anahtar yok"}
                </span>
              </div>
              <p className="text-xs text-(--color-text-muted)">
                Son başarılı çağrı: {fmtDateTime(h.lastSuccessAt)}
                {h.failures24h > 0 && ` · son 24 saatte ${h.failures24h} hata`}
              </p>
              {h.lastFailure && (h.status === "problem" || h.status === "warn") && (
                <p className="rounded-lg bg-(--color-surface-muted) p-2 text-[11px] break-words">
                  <span className="font-semibold">{FAILURE_LABEL[h.lastFailure.code]}</span> · {fmtDateTime(h.lastFailure.createdAt)}
                  <span className="block text-(--color-text-muted)">{h.lastFailure.message.slice(0, 220)}</span>
                </p>
              )}
              {bal?.balance && bal.remainingUsd != null && (
                <div className="text-sm">
                  <span className="text-xs text-(--color-text-muted)">Tahmini kalan bakiye: </span>
                  <span className={`font-bold ${low ? "text-rose-700 dark:text-rose-400" : ""}`}>{fmtUsd(bal.remainingUsd)}</span>
                  <span className="block text-[11px] text-(--color-text-muted)">
                    {fmtUsd(bal.balance.amountUsd)} yüklendi ({bal.balance.since}) · {fmtUsd(bal.spentUsd)} harcandı
                    {low && " · azaldı, yükleme yapın"}
                  </span>
                </div>
              )}
              <BalanceEditor provider={h.provider} amountUsd={bal?.balance?.amountUsd ?? null} since={bal?.balance?.since ?? null} />
              <div className="flex flex-wrap items-start justify-between gap-2 pt-1">
                <ProviderTestButton provider={h.provider} disabled={!h.hasKey} />
                <a href={h.billingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 pt-1.5 text-xs font-semibold text-brand-600 hover:underline">
                  Ödeme sayfası <ExternalLink size={12} />
                </a>
              </div>
            </div>
          );
        })}
      </section>
      <p className="-mt-2 text-[11px] text-(--color-text-muted)">
        Sağlayıcılar kalan bakiyeyi API ile vermiyor. Sistem her başarısız çağrıyı kaydeder; ödeme ya da anahtar sorunu olursa size hemen bildirim gelir ve burada kırmızı uyarı çıkar.
        Kesinti yaşamamak için sağlayıcı hesabınızda otomatik yüklemeyi (auto-reload) açmanız önerilir.
      </p>

      {/* Dönem */}
      <nav className="flex flex-wrap gap-1.5" aria-label="Dönem">
        {COST_RANGES.map((r) => (
          <Link
            key={r.id}
            href={`/mesaj-otomasyonu/ai-maliyet?d=${r.id}`}
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${r.id === range ? "border-brand-600 bg-brand-600 text-white" : "border-(--color-border) hover:bg-(--color-surface-muted)"}`}
          >
            {r.label}
          </Link>
        ))}
      </nav>

      {/* Özet */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cardCls}>
          <p className="text-xs text-(--color-text-muted)">Toplam AI harcaması</p>
          <p className="text-2xl font-bold">{fmtUsd(data.totalUsd)}</p>
          {rate && <p className="text-xs text-(--color-text-muted)">{fmtTry(data.totalUsd, rate)}</p>}
          {change != null && (
            <p className="text-xs text-(--color-text-muted)">
              Önceki döneme göre {change >= 0 ? "+" : ""}
              {change.toFixed(0)}% ({fmtUsd(data.prevUsd)})
            </p>
          )}
        </div>
        {data.projectedUsd != null && (
          <div className={cardCls}>
            <p className="text-xs text-(--color-text-muted)">Ay sonu tahmini</p>
            <p className="text-2xl font-bold">{fmtUsd(data.projectedUsd)}</p>
            {rate && <p className="text-xs text-(--color-text-muted)">{fmtTry(data.projectedUsd, rate)}</p>}
            <p className="text-xs text-(--color-text-muted)">Bu ayki günlük ortalamaya göre</p>
          </div>
        )}
        <div className={cardCls}>
          <p className="text-xs text-(--color-text-muted)">AI çağrısı</p>
          <p className="text-2xl font-bold">{fmtNum(data.totalCalls)}</p>
          <p className="text-xs text-(--color-text-muted)">Çağrı başı ort. {data.totalCalls ? fmtUsd(data.totalUsd / data.totalCalls) : "—"}</p>
        </div>
        <div className={cardCls}>
          <p className="text-xs text-(--color-text-muted)">Token (giriş / çıkış)</p>
          <p className="text-2xl font-bold">
            {fmtTokens(data.totalIn)} / {fmtTokens(data.totalOut)}
          </p>
          <p className="text-xs text-(--color-text-muted)">{data.byClient.filter((c) => c.clientId).length} müşteri</p>
        </div>
      </section>

      {unpriced.length > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Fiyatı girilmemiş model var: {unpriced.map((m) => m.ref).join(", ")}. Bu modellerin maliyeti $0 görünür; aşağıdaki model tablosundan fiyatını girin.
        </p>
      )}

      {/* Günlük */}
      {data.daily.length > 0 && (
        <section className={cardCls}>
          <h2 className="mb-3 text-sm font-bold">Günlük harcama</h2>
          <div className="flex h-36 items-end gap-0.5" role="img" aria-label="Günlük AI harcaması">
            {data.daily.map((x) => {
              const label = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(x.day));
              return (
                <div key={String(x.day)} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${label}: ${fmtUsd(x.costUsd)} · ${x.calls} çağrı`}>
                  <div className="w-full rounded-t-[4px] bg-brand-500 group-hover:bg-brand-700" style={{ height: `${maxDay ? Math.max(2, (x.costUsd / maxDay) * 100) : 2}%` }} />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-(--color-text-muted)">
            <span>{new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(data.daily[0].day))}</span>
            <span>En yüksek gün: {fmtUsd(maxDay)}</span>
            <span>{new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(data.daily[data.daily.length - 1].day))}</span>
          </div>
        </section>
      )}

      {/* Müşteri bazında */}
      <section className={cardCls}>
        <h2 className="mb-1 text-sm font-bold">Müşteri bazında</h2>
        <p className="mb-3 text-xs text-(--color-text-muted)">Satıra tıklayınca o müşterinin model kırılımı açılır. &quot;Kredi&quot;: bu dönemde müşterinin harcadığı mesaj kredisi.</p>
        {data.byClient.length === 0 ? (
          <p className="text-xs text-(--color-text-muted)">Bu dönemde AI kullanımı yok.</p>
        ) : (
          <div className="divide-y divide-(--color-border)">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 pb-2 text-[11px] font-semibold text-(--color-text-muted) sm:grid-cols-[1fr_6rem_6rem_6rem_7rem]">
              <span>Müşteri</span>
              <span className="text-right">Çağrı</span>
              <span className="hidden text-right sm:block">Kredi</span>
              <span className="text-right">Pay</span>
              <span className="text-right">Maliyet</span>
            </div>
            {data.byClient.map((c) => (
              <details key={c.clientId ?? "none"} className="group py-2">
                <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto_auto_auto] items-center gap-3 text-sm sm:grid-cols-[1fr_6rem_6rem_6rem_7rem]">
                  <span className="min-w-0 truncate font-medium">
                    <span className="mr-1 inline-block text-(--color-text-muted) transition-transform group-open:rotate-90">›</span>
                    {c.name}
                  </span>
                  <span className="text-right tabular-nums">{fmtNum(c.calls)}</span>
                  <span className="hidden text-right tabular-nums sm:block">{c.clientId ? fmtNum(c.creditsUsed) : "—"}</span>
                  <span className="text-right tabular-nums text-(--color-text-muted)">{data.totalUsd ? `${((c.costUsd / data.totalUsd) * 100).toFixed(0)}%` : "—"}</span>
                  <span className="text-right font-semibold tabular-nums">
                    {fmtUsd(c.costUsd)}
                    {rate && <span className="block text-[11px] font-normal text-(--color-text-muted)">{fmtTry(c.costUsd, rate)}</span>}
                  </span>
                </summary>
                <div className="mt-2 space-y-1 rounded-lg bg-(--color-surface-muted) p-2 text-xs">
                  {c.models.map((m) => (
                    <div key={m.ref} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{m.ref}</span>
                      <span className="shrink-0 tabular-nums text-(--color-text-muted)">
                        {fmtNum(m.calls)} çağrı · {fmtTokens(m.inputTokens)}/{fmtTokens(m.outputTokens)} token · <span className="font-semibold text-(--color-text)">{fmtUsd(m.costUsd)}</span>
                      </span>
                    </div>
                  ))}
                  {c.clientId && (
                    <div className="flex flex-wrap justify-between gap-2 pt-1 text-(--color-text-muted)">
                      <span>{c.creditsUsed > 0 ? `Kredi başına AI maliyeti: ${fmtUsd(c.costUsd / c.creditsUsed)}` : "Bu dönemde kredi harcanmadı"}</span>
                      <Link href={`/mesaj-otomasyonu/${encodeURIComponent(c.clientId)}?sekme=kredi`} className="font-semibold text-brand-600 hover:underline">
                        Müşterinin kredi sayfası
                      </Link>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        {/* Model bazında */}
        <section className={cardCls}>
          <h2 className="mb-1 text-sm font-bold">Model bazında</h2>
          <p className="mb-3 text-xs text-(--color-text-muted)">Fiyat: 1 milyon token için giriş / çıkış ($). Tıklayıp güncelleyebilirsiniz; yeni çağrılar yeni fiyatla hesaplanır.</p>
          {data.byModel.length === 0 ? (
            <p className="text-xs text-(--color-text-muted)">Bu dönemde AI kullanımı yok.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-(--color-text-muted)">
                    <th className="pb-2 font-semibold">Model</th>
                    <th className="pb-2 text-right font-semibold">Çağrı</th>
                    <th className="pb-2 text-right font-semibold">Token</th>
                    <th className="pb-2 pl-3 font-semibold">Fiyat</th>
                    <th className="pb-2 text-right font-semibold">Maliyet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--color-border)">
                  {data.byModel.map((m) => {
                    const p = data.prices[m.ref];
                    return (
                      <tr key={m.ref}>
                        <td className="py-2">
                          <span className="font-medium">{m.model}</span>
                          <span className="block text-[11px] text-(--color-text-muted)">{providerOf(m.ref)}</span>
                        </td>
                        <td className="py-2 text-right tabular-nums">{fmtNum(m.calls)}</td>
                        <td className="py-2 text-right tabular-nums text-xs">
                          {fmtTokens(m.inputTokens)} / {fmtTokens(m.outputTokens)}
                        </td>
                        <td className="py-2 pl-3 text-xs">{m.provider === "fake" ? "—" : <PriceEditor modelRef={m.ref} input={p?.[0] ?? null} output={p?.[1] ?? null} />}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{fmtUsd(m.costUsd)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* İş türüne göre + hatalar */}
        <div className="space-y-4">
          <section className={cardCls}>
            <h2 className="mb-2 text-sm font-bold">Ne için harcandı</h2>
            {data.byKind.length === 0 ? (
              <p className="text-xs text-(--color-text-muted)">—</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.byKind.map((k) => (
                  <li key={k.kind} className="flex justify-between gap-2">
                    <span>{KIND_LABEL[k.kind] ?? k.kind}</span>
                    <span className="tabular-nums">
                      <span className="text-xs text-(--color-text-muted)">{fmtNum(k.calls)} · </span>
                      {fmtUsd(k.costUsd)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className={cardCls}>
            <h2 className="mb-2 text-sm font-bold">Başarısız AI çağrıları</h2>
            {data.recentFailures.length === 0 ? (
              <p className="text-xs text-(--color-text-muted)">Bu dönemde hata yok.</p>
            ) : (
              <>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {data.failures.map((f) => (
                    <span key={`${f.provider}-${f.code}`} className={`${chip} ${f.code === "BILLING" || f.code === "KEY" ? STATUS.problem.cls : STATUS.warn.cls}`}>
                      {f.provider}: {FAILURE_LABEL[f.code as AiFailureCode] ?? f.code} ×{f.count}
                    </span>
                  ))}
                </div>
                <ul className="space-y-1.5 text-xs">
                  {data.recentFailures.map((f) => (
                    <li key={f.id} className="break-words">
                      <span className="font-semibold">{FAILURE_LABEL[f.code as AiFailureCode] ?? f.code}</span> · {f.provider}:{f.model} · {fmtDateTime(f.createdAt)}
                      {f.clientName && ` · ${f.clientName}`}
                      <span className="block text-(--color-text-muted)">{f.message.slice(0, 160)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      </div>
      <p className="text-[11px] text-(--color-text-muted)">
        Tutarlar, her AI çağrısının token sayısı × model fiyatı ile hesaplanan tahmindir. Sağlayıcının faturası küçük farklarla değişebilir (vergi, ücretsiz kota, önbellek indirimi).
      </p>
    </div>
  );
}
