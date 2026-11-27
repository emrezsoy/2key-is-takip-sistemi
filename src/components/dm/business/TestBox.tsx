"use client";

import { useState } from "react";
import { testReply } from "@/lib/actions/dmConfig";
import { useAction } from "../useAction";
import { Feedback } from "../Feedback";
import { btnPrimary, cardCls, inputCls } from "../ui";

type Result = { text: string; toolCalls: { name: string; args: Record<string, unknown> }[]; model: string; costUsd: number; credits: number };

/** Örnek bir mesajla AI'ın nasıl cevap verdiğini dener; gerçek gönderim yapılmaz. */
export function TestBox({ clientId, spendsCredit, showCost }: { clientId: string; spendsCredit: boolean; showCost: boolean }) {
  const [msg, setMsg] = useState("");
  const [results, setResults] = useState<(Result & { msg: string })[]>([]);
  const { pending, error, run } = useAction();
  return (
    <section className={`${cardCls} space-y-3`}>
      <div>
        <h3 className="text-sm font-bold">Test et</h3>
        <p className="text-xs text-(--color-text-muted)">
          Bir müşteri gibi yazın; AI&apos;ın cevabını görün. Mesaj kimseye gönderilmez{spendsCredit ? ", ama her deneme 1 kredi harcar" : " ve kredi harcanmaz"}.
          Soru sorma / devretme gibi işlemler taklit edilir.
        </p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const m = msg;
          run(async () => {
            const r = await testReply(clientId, m);
            setResults((rs) => [{ ...r, msg: m }, ...rs].slice(0, 10));
            setMsg("");
          });
        }}
      >
        <input value={msg} onChange={(e) => setMsg(e.target.value)} className={inputCls} placeholder="Ör. Merhaba, bu ayakkabının 38 numarası var mı?" />
        <button type="submit" disabled={pending || !msg.trim()} className={`${btnPrimary} shrink-0`}>
          {pending ? "…" : "Dene"}
        </button>
      </form>
      <Feedback error={error} info={null} />
      <ul className="space-y-3">
        {results.map((r, i) => (
          <li key={i} className="space-y-1.5 text-sm">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-(--color-surface-muted) px-3 py-2">{r.msg}</p>
            <p className="w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-brand-600 px-3 py-2 text-white">{r.text}</p>
            <p className="text-[11px] text-(--color-text-muted)">
              {r.toolCalls.length > 0 && `Araçlar: ${r.toolCalls.map((t) => t.name).join(", ")} · `}
              {showCost && `${r.model} · ~$${r.costUsd.toFixed(5)}`}
              {r.credits ? ` · ${r.credits} kredi` : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
