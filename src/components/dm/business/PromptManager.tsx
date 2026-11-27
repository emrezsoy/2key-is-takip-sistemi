"use client";

import { useState } from "react";
import { activatePrompt, decidePrompt, proposePrompt } from "@/lib/actions/dmConfig";
import { useAction } from "../useAction";
import { Feedback } from "../Feedback";
import { btnPrimary, btnSecondary, cardCls, chip, fmtDateTime, inputCls } from "../ui";

type Version = {
  id: string;
  text: string;
  source: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  note: string | null;
  createdByName: string | null;
  decidedByName: string | null;
  createdAt: Date;
  active: boolean;
};

const SOURCE_LABEL: Record<string, string> = { ONBOARDING: "Sesli kurulum", CLIENT_EDIT: "Müşteri", ADMIN_EDIT: "Ekip" };
const STATUS_CLS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  REJECTED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};
const STATUS_TEXT: Record<string, string> = { PENDING: "Onay bekliyor", APPROVED: "Onaylı", REJECTED: "Reddedildi" };

/** AI davranışı (işletmeye özel talimat). Admin kaydedince yayına girer; müşteri / ekip önerileri admin onayına düşer. */
export function PromptManager({ clientId, versions, isAdmin }: { clientId: string; versions: Version[]; isAdmin: boolean }) {
  const active = versions.find((v) => v.active);
  const [text, setText] = useState(active?.text ?? "");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const { pending, error, info, run } = useAction();
  const pendingOnes = versions.filter((v) => v.status === "PENDING");

  return (
    <section className={`${cardCls} space-y-3`}>
      <div>
        <h3 className="text-sm font-bold">AI davranışı (talimat)</h3>
        <p className="text-xs text-(--color-text-muted)">
          AI&apos;ın üslubu, satış yaklaşımı ve özel kuralları. {isAdmin ? "Kaydettiğiniz metin hemen yayına girer." : "Değişiklikler 2 Key Idea ekibinin onayından sonra yayına girer."}
        </p>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className={`${inputCls} font-mono text-xs`} placeholder="Ör. Samimi ama saygılı konuş, 'siz' diye hitap et. Fiyat sorulunca kampanyayı da hatırlat…" />
      <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="Değişiklik notu (isteğe bağlı)" />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || text.trim() === (active?.text ?? "").trim()}
          onClick={() => run(async () => { await proposePrompt(clientId, text, note); setNote(""); }, isAdmin ? "Yayına alındı." : "Onaya gönderildi.")}
          className={btnPrimary}
        >
          {isAdmin ? "Kaydet ve yayına al" : "Onaya gönder"}
        </button>
        <Feedback error={error} info={info} />
      </div>

      {isAdmin && pendingOnes.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-300 p-3">
          <h4 className="text-sm font-semibold">Onay bekleyen değişiklikler</h4>
          {pendingOnes.map((v) => (
            <div key={v.id} className="space-y-1.5 border-b border-(--color-border) pb-2 last:border-0">
              <p className="text-xs text-(--color-text-muted)">
                {SOURCE_LABEL[v.source]} · {v.createdByName ?? "—"} · {fmtDateTime(v.createdAt)}
                {v.note ? ` · ${v.note}` : ""}
              </p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-(--color-surface-muted) p-2 text-xs">{v.text}</pre>
              <div className="flex gap-2">
                <button type="button" disabled={pending} onClick={() => run(() => decidePrompt(v.id, true), "Onaylandı ve yayına alındı.")} className={btnSecondary}>
                  Onayla
                </button>
                <button type="button" disabled={pending} onClick={() => run(() => decidePrompt(v.id, false), "Reddedildi.")} className={btnSecondary}>
                  Reddet
                </button>
                <button type="button" onClick={() => setText(v.text)} className="text-xs text-(--color-text-muted) hover:text-brand-600">
                  Düzenleyerek kullan
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <details>
        <summary className="cursor-pointer text-xs font-semibold text-(--color-text-muted)">Sürüm geçmişi ({versions.length})</summary>
        <ul className="mt-2 space-y-1.5">
          {versions.map((v) => (
            <li key={v.id} className="rounded-lg border border-(--color-border) p-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`${chip} ${STATUS_CLS[v.status]}`}>{v.active ? "Yayında" : STATUS_TEXT[v.status]}</span>
                <span className="text-(--color-text-muted)">
                  {SOURCE_LABEL[v.source]} · {v.createdByName ?? "—"} · {fmtDateTime(v.createdAt)}
                </span>
                <button type="button" onClick={() => setOpen(open === v.id ? null : v.id)} className="ml-auto underline">
                  {open === v.id ? "Gizle" : "Göster"}
                </button>
                {isAdmin && v.status === "APPROVED" && !v.active && (
                  <button type="button" disabled={pending} onClick={() => run(() => activatePrompt(v.id), "Bu sürüme dönüldü.")} className="font-semibold text-brand-600">
                    Bu sürüme dön
                  </button>
                )}
              </div>
              {open === v.id && <pre className="mt-1.5 max-h-60 overflow-auto whitespace-pre-wrap">{v.text}</pre>}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
