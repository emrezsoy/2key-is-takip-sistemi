"use client";

import { useState } from "react";
import { Bot, Coins } from "lucide-react";
import { setDmPaused } from "@/lib/actions/dmInbox";
import { requestDmCredit } from "@/lib/actions/dmCredits";
import { useAction } from "../useAction";
import { Feedback } from "../Feedback";
import { btnSecondary, cardCls, inputCls } from "../ui";

/** Müşteri paneli üst şeridi: kalan kredi, "Kredi talep et", AI aç/kapat ve uyarılar. */
export function DmTopBar({
  clientId,
  total,
  approxReplies,
  paused,
  canReply,
  grace,
  openRequest,
}: {
  clientId: string;
  total: number;
  approxReplies: number;
  paused: boolean;
  canReply: boolean;
  grace: boolean;
  openRequest: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const { pending, error, info, run } = useAction();
  return (
    <div className={`${cardCls} space-y-3`}>
      <div className="flex flex-wrap items-center gap-3">
        <Coins size={20} className="text-brand-600" />
        <div>
          <p className="text-xl font-bold leading-none">{total}</p>
          <p className="text-xs text-(--color-text-muted)">kalan kredi · yaklaşık {approxReplies} cevap</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending || openRequest} onClick={() => setAsking((v) => !v)} className={btnSecondary}>
            {openRequest ? "Kredi talebiniz alındı" : "Kredi talep et"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setDmPaused(clientId, !paused), paused ? "AI yeniden açıldı; yeni mesajlara cevap verecek." : "AI kapatıldı; mesajlar gelen kutusunda sizi bekleyecek.")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${paused ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200" : "bg-emerald-600 text-white"}`}
          >
            <Bot size={15} /> AI {paused ? "kapalı" : "açık"}
          </button>
        </div>
      </div>
      {asking && !openRequest && (
        <div className="flex flex-wrap gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} flex-1`} placeholder="Not (isteğe bağlı): ör. 1 aylık paket yenilemek istiyorum" />
          <button type="button" disabled={pending} onClick={() => run(() => requestDmCredit(clientId, note), "Talebiniz ekibimize iletildi.", () => setAsking(false))} className={btnSecondary}>
            Gönder
          </button>
        </div>
      )}
      {!canReply && (
        <p className="rounded-lg bg-rose-50 p-2 text-xs text-rose-800 dark:bg-rose-900/20 dark:text-rose-200">
          Krediniz bitti: AI yeni mesajlara cevap vermiyor, mesajlar gelen kutusunda sizi bekliyor. Kredi yüklenince AI yalnızca yeni mesajlara cevap verir;
          bekleyenleri &quot;Bekleyen işler&quot;den seçerek cevaplatabilirsiniz.
        </p>
      )}
      {grace && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          Abonelik döneminiz bitti, ödeme bekleniyor. Kısa bir ek süre boyunca hizmet devam eder.
        </p>
      )}
      <Feedback error={error} info={info} />
    </div>
  );
}
