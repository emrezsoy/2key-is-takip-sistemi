import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, BarChart3, Coins, MessageCircle, Settings2, XCircle } from "lucide-react";
import { auth } from "@/auth";
import { dmClientScope, canUseDm } from "@/lib/dm/access";
import { loadDmOverview } from "@/lib/dm/overview";
import { loadAiAlerts } from "@/lib/dm/aiCost";
import { SUB_LABEL, cardCls, chip, fmtDate, fmtDateTime } from "@/components/dm/ui";
import { ResolveCreditRequestButton } from "@/components/dm/credits/ResolveCreditRequestButton";

export const metadata = { title: "Mesaj Otomasyonu" };

export default async function DmOverviewPage() {
  const session = await auth();
  if (!session?.user) redirect("/giris");
  if (!(await canUseDm(session.user))) redirect("/");
  const isAdmin = session.user.role === "ADMIN";
  const data = await loadDmOverview(await dmClientScope(session.user));
  const aiAlerts = isAdmin ? await loadAiAlerts() : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Mesaj Otomasyonu</h1>
          <p className="text-sm text-(--color-text-muted)">
            Instagram ve Facebook mesajlarını AI ile yanıtlama. Hizmet, müşterinin &quot;Müşteri paneli&quot; penceresinden açılır.
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Link href="/mesaj-otomasyonu/ai-maliyet" className="flex items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-1.5 text-sm font-semibold hover:bg-(--color-surface-muted)">
              <BarChart3 size={15} /> AI maliyeti
            </Link>
            <Link href="/mesaj-otomasyonu/paketler" className="flex items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-1.5 text-sm font-semibold hover:bg-(--color-surface-muted)">
              <Settings2 size={15} /> Paketler ve fiyatlar
            </Link>
          </div>
        )}
      </div>

      {aiAlerts?.problems.map((p) => (
        <Link
          key={p.provider}
          href="/mesaj-otomasyonu/ai-maliyet"
          className="flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 hover:border-rose-500 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
        >
          <XCircle size={20} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-bold">
              {p.label}: {p.lastFailure?.code === "BILLING" ? "ödeme alınamıyor / bakiye bitmiş olabilir" : "API anahtarı çalışmıyor"}.
            </span>{" "}
            AI bu sağlayıcıyla cevap veremiyor. Ayrıntı için tıklayın.
          </span>
        </Link>
      ))}
      {aiAlerts?.low.map((l) => (
        <Link
          key={l.provider}
          href="/mesaj-otomasyonu/ai-maliyet"
          className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 hover:border-amber-500 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle size={20} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-bold">{l.provider} bakiyesi azaldı:</span> tahmini ${l.remainingUsd.toFixed(2)} kaldı. Bitmeden yükleme yapın.
          </span>
        </Link>
      ))}

      {data.rows.length === 0 ? (
        <div className={cardCls}>
          <p className="text-sm">Henüz Mesaj Otomasyonu hizmeti açık müşteri yok.</p>
          <p className="mt-1 text-xs text-(--color-text-muted)">Müşteriler sayfasında müşterinin &quot;Müşteri paneli&quot; penceresinden &quot;Mesaj Otomasyonu&quot;nu işaretleyin.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.rows.map((r) => {
            const sub = SUB_LABEL[r.subscription] ?? SUB_LABEL.NONE;
            return (
              <Link key={r.id} href={`/mesaj-otomasyonu/${encodeURIComponent(r.id)}`} className={`${cardCls} block space-y-2 transition-colors hover:border-brand-500`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold">{r.name}</p>
                  <span className={`${chip} ${sub.cls}`}>{sub.text}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Coins size={15} className="text-brand-600" />
                  <span className="font-bold">{r.total}</span>
                  <span className="text-xs text-(--color-text-muted)">kredi · ~{r.approxReplies} cevap</span>
                </div>
                <p className="text-xs text-(--color-text-muted)">
                  Dönem sonu: {fmtDate(r.paidThrough)} · Bugün {r.todayMessages} mesaj
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {!r.hasAccount && <span className={`${chip} bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300`}>Sayfa bağlı değil</span>}
                  {r.paused && <span className={`${chip} bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300`}>AI kapalı</span>}
                  {!r.canReply && <span className={`${chip} bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300`}>Kredi bitti</span>}
                  {r.renewalSoon && <span className={`${chip} bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300`}>Yenileme</span>}
                  {r.waiting > 0 && <span className={`${chip} bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300`}>{r.waiting} insan bekliyor</span>}
                  {r.failed24h > 0 && <span className={`${chip} bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300`}>{r.failed24h} gönderim hatası</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {isAdmin && (
          <section className={cardCls}>
            <h2 className="mb-2 text-sm font-bold">Onay kuyruğu</h2>
            {data.pendingPrompts.length + data.pendingOnboard.length === 0 ? (
              <p className="text-xs text-(--color-text-muted)">Onay bekleyen kurulum çıktısı ya da prompt değişikliği yok.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {data.pendingOnboard.map((o) => (
                  <li key={o.id}>
                    <Link href={`/mesaj-otomasyonu/${encodeURIComponent(o.clientId)}?sekme=isletme`} className="hover:text-brand-600">
                      <span className="font-medium">{o.client.name}</span> — sesli kurulum çıktısı
                    </Link>
                  </li>
                ))}
                {data.pendingPrompts.map((p) => (
                  <li key={p.id}>
                    <Link href={`/mesaj-otomasyonu/${encodeURIComponent(p.clientId)}?sekme=isletme`} className="hover:text-brand-600">
                      <span className="font-medium">{p.client.name}</span> — prompt değişikliği ({p.createdByName ?? "—"}, {fmtDateTime(p.createdAt)})
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {isAdmin && (
          <section className={cardCls}>
            <h2 className="mb-2 text-sm font-bold">Kredi talepleri ve yenilemeler</h2>
            {data.openRequests.length === 0 && !data.rows.some((r) => r.renewalSoon) ? (
              <p className="text-xs text-(--color-text-muted)">Açık kredi talebi ya da yenilemesi yaklaşan müşteri yok.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.openRequests.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-2">
                    <Link href={`/mesaj-otomasyonu/${encodeURIComponent(r.clientId)}?sekme=kredi`} className="min-w-0 hover:text-brand-600">
                      <span className="font-medium">{r.client.name}</span> kredi talep etti
                      <span className="block text-[11px] text-(--color-text-muted)">
                        {fmtDateTime(r.createdAt)}{r.note ? ` · ${r.note}` : ""}
                      </span>
                    </Link>
                    <ResolveCreditRequestButton id={r.id} />
                  </li>
                ))}
                {data.rows
                  .filter((r) => r.renewalSoon)
                  .map((r) => (
                    <li key={`ren-${r.id}`}>
                      <Link href={`/mesaj-otomasyonu/${encodeURIComponent(r.id)}?sekme=kredi`} className="hover:text-brand-600">
                        <span className="font-medium">{r.name}</span> — {r.subscription === "GRACE" ? "ödeme bekleniyor (ek süre)" : `dönem ${fmtDate(r.paidThrough)} bitiyor`}
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        )}

        <section className={`${cardCls} lg:col-span-2`}>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
            <AlertTriangle size={15} className="text-amber-600" /> Sorunlu konuşmalar
          </h2>
          {data.waiting.length === 0 ? (
            <p className="text-xs text-(--color-text-muted)">İnsana devredilen ya da insan bekleyen konuşma yok.</p>
          ) : (
            <ul className="divide-y divide-(--color-border) text-sm">
              {data.waiting.map((w) => (
                <li key={w.id} className="py-2">
                  <Link href={`/mesaj-otomasyonu/${encodeURIComponent(w.clientId)}?sekme=gelen&k=${w.id}`} className="flex items-center gap-2 hover:text-brand-600">
                    <MessageCircle size={14} className="shrink-0 text-(--color-text-muted)" />
                    <span className="font-medium">{w.clientName}</span>
                    <span className="truncate text-(--color-text-muted)">
                      {w.contact.name ?? w.contact.username ?? "Kişi"} · {w.handoffReason ?? (w.waitingHuman ? "insan bekliyor" : "")}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-(--color-text-muted)">{fmtDateTime(w.lastMessageAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
