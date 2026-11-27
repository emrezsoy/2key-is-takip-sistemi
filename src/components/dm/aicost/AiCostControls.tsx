"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Pencil, RefreshCw, XCircle } from "lucide-react";
import { saveAiBalance, saveAiPrice, saveUsdTry, testAiProvider } from "@/lib/actions/dmAiCost";
import { btnSecondary, inputCls } from "@/components/dm/ui";

type Msg = { ok: boolean; message: string } | null;

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) => {
    setMsg(null);
    start(async () => {
      try {
        const r = await fn();
        setMsg(r);
        if (r.ok) {
          after?.();
          router.refresh();
        }
      } catch {
        setMsg({ ok: false, message: "Kaydedilemedi." });
      }
    });
  };
  return { pending, msg, run };
}

const MsgLine = ({ msg }: { msg: Msg }) =>
  msg ? <p className={`mt-1 text-xs ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>{msg.message}</p> : null;

/** Sağlayıcıyı küçük bir çağrıyla dener. */
export function ProviderTestButton({ provider, disabled }: { provider: string; disabled?: boolean }) {
  const { pending, msg, run } = useSave();
  return (
    <div>
      <button type="button" className={`${btnSecondary} flex items-center gap-1.5`} disabled={pending || disabled} onClick={() => run(() => testAiProvider(provider))}>
        {pending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Şimdi test et
      </button>
      {msg && (
        <p className={`mt-1 flex items-start gap-1 text-xs ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
          {msg.ok ? <CheckCircle2 size={13} className="mt-px shrink-0" /> : <XCircle size={13} className="mt-px shrink-0" />}
          <span className="break-words">{msg.message}</span>
        </p>
      )}
    </div>
  );
}

/** Sağlayıcıya yüklenen bakiye: tahmini kalanı hesaplamak için. */
export function BalanceEditor({ provider, amountUsd, since }: { provider: string; amountUsd: number | null; since: string | null }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(amountUsd != null ? String(amountUsd) : "");
  const [date, setDate] = useState(since ?? new Date().toISOString().slice(0, 10));
  const { pending, msg, run } = useSave();
  if (!open)
    return (
      <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline" onClick={() => setOpen(true)}>
        <Pencil size={12} /> {amountUsd != null ? "Bakiyeyi güncelle" : "Yüklenen bakiyeyi gir"}
      </button>
    );
  return (
    <div className="space-y-1.5 rounded-lg border border-(--color-border) p-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-(--color-text-muted)">
          Yüklenen tutar ($)
          <input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ör. 50" />
        </label>
        <label className="text-[11px] text-(--color-text-muted)">
          Yükleme tarihi
          <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <p className="text-[11px] text-(--color-text-muted)">Kalan = yüklenen − bu tarihten beri sistemin hesapladığı harcama. Sağlayıcıdaki gerçek bakiye biraz farklı olabilir.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btnSecondary}
          disabled={pending}
          onClick={() => run(() => saveAiBalance({ provider, amountUsd: amount.trim() ? Number(amount.replace(",", ".")) : null, since: date }), () => setOpen(false))}
        >
          Kaydet
        </button>
        {amountUsd != null && (
          <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => saveAiBalance({ provider, amountUsd: null, since: date }), () => setOpen(false))}>
            Takibi kapat
          </button>
        )}
        <button type="button" className="text-xs text-(--color-text-muted)" onClick={() => setOpen(false)}>
          Vazgeç
        </button>
      </div>
      <MsgLine msg={msg} />
    </div>
  );
}

/** Model fiyatı (USD / 1M token). */
export function PriceEditor({ modelRef, input, output }: { modelRef: string; input: number | null; output: number | null }) {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(input != null ? String(input) : "");
  const [b, setB] = useState(output != null ? String(output) : "");
  const { pending, msg, run } = useSave();
  const n = (v: string) => (v.trim() ? Number(v.replace(",", ".")) : null);
  if (!open)
    return (
      <button type="button" className="text-brand-600 hover:underline" onClick={() => setOpen(true)} title="Fiyatı düzenle">
        {input == null ? "fiyat gir" : `$${input} / $${output}`}
      </button>
    );
  return (
    <div className="flex flex-wrap items-center gap-1">
      <input className={`${inputCls} w-20! px-2! py-1!`} inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} placeholder="giriş" aria-label="Giriş fiyatı" />
      <input className={`${inputCls} w-20! px-2! py-1!`} inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} placeholder="çıkış" aria-label="Çıkış fiyatı" />
      <button type="button" className={`${btnSecondary} px-2! py-1!`} disabled={pending} onClick={() => run(() => saveAiPrice({ ref: modelRef, inputUsd: n(a), outputUsd: n(b) }), () => setOpen(false))}>
        Kaydet
      </button>
      <button type="button" className="text-xs text-(--color-text-muted)" onClick={() => setOpen(false)}>
        Vazgeç
      </button>
      <MsgLine msg={msg} />
    </div>
  );
}

export function UsdTryEditor({ rate }: { rate: number | null }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(rate != null ? String(rate) : "");
  const { pending, msg, run } = useSave();
  if (!open)
    return (
      <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline" onClick={() => setOpen(true)}>
        <Pencil size={12} /> {rate ? `Dolar kuru: ₺${rate}` : "TL karşılığı için dolar kurunu gir"}
      </button>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className={`${inputCls} w-28!`} inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="ör. 42,5" aria-label="Dolar kuru" />
      <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => saveUsdTry(v.trim() ? Number(v.replace(",", ".")) : null), () => setOpen(false))}>
        Kaydet
      </button>
      <button type="button" className="text-xs text-(--color-text-muted)" onClick={() => setOpen(false)}>
        Vazgeç
      </button>
      <MsgLine msg={msg} />
    </div>
  );
}
