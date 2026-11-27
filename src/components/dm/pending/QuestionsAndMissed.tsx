"use client";

import { useState } from "react";
import Link from "next/link";
import { answerQuestionAction, dismissQuestionAction, replyMissedConversations } from "@/lib/actions/dmInbox";
import { useAction } from "../useAction";
import { Feedback } from "../Feedback";
import { btnPrimary, btnSecondary, cardCls, fmtDateTime, inputCls } from "../ui";

type Question = { id: string; question: string; conversationId: string; name: string; createdAt: Date };
type Missed = { id: string; name: string; lastText: string; windowEndsAt: Date };

function QuestionItem({ q, basePath }: { q: Question; basePath: string }) {
  const [answer, setAnswer] = useState("");
  const [save, setSave] = useState(true);
  const { pending, error, info, run } = useAction();
  return (
    <li className="space-y-2 border-b border-(--color-border) py-3 last:border-0">
      <p className="text-sm">
        <span className="font-semibold">{q.question}</span>
        <span className="block text-[11px] text-(--color-text-muted)">
          {q.name} · {fmtDateTime(q.createdAt)} ·{" "}
          <Link href={`${basePath}?sekme=gelen&k=${q.conversationId}`} className="underline">
            konuşmayı aç
          </Link>
        </span>
      </p>
      <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} className={inputCls} placeholder="Cevabınız (AI bunu müşteriye iletir)" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending || !answer.trim()} onClick={() => run(() => answerQuestionAction(q.id, answer, save), "Cevap kaydedildi; müşteriye iletiliyor.")} className={btnPrimary}>
          Cevapla
        </button>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="h-4 w-4" />
          Bilgi bankasına ekle (AI bir dahaki sefere kendisi cevaplasın)
        </label>
        <button type="button" disabled={pending} onClick={() => run(() => dismissQuestionAction(q.id), "Soru kapatıldı.")} className="text-xs text-(--color-text-muted) hover:text-brand-600">
          Kapat
        </button>
      </div>
      <Feedback error={error} info={info} />
    </li>
  );
}

export function QuestionsPanel({ questions, basePath }: { questions: Question[]; basePath: string }) {
  return (
    <section className={cardCls}>
      <h3 className="text-sm font-bold">AI&apos;ın sorduğu sorular</h3>
      {questions.length === 0 ? (
        <p className="mt-1 text-xs text-(--color-text-muted)">Bekleyen soru yok.</p>
      ) : (
        <ul>
          {questions.map((q) => (
            <QuestionItem key={q.id} q={q} basePath={basePath} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Duraklama (kredi bitti / AI kapalı) sırasında cevapsız kalan konuşmalar: yalnızca seçilenler cevaplanır. */
export function MissedPanel({ clientId, missed }: { clientId: string; missed: Missed[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const { pending, error, info, run } = useAction();
  if (missed.length === 0) return null;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <section className={`${cardCls} border-amber-300`}>
      <h3 className="text-sm font-bold">Cevapsız kalan konuşmalar</h3>
      <p className="mb-2 text-xs text-(--color-text-muted)">
        AI dururken bu kişiler yazdı ve henüz cevap almadı (24 saat penceresi hâlâ açık). AI kendiliğinden cevap vermez; cevaplanmasını
        istediklerinizi seçin.
      </p>
      <ul className="space-y-1.5">
        {missed.map((m) => (
          <li key={m.id}>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} className="mt-0.5 h-4 w-4" />
              <span className="min-w-0">
                <span className="font-medium">{m.name}</span>
                <span className="block truncate text-xs text-(--color-text-muted)">
                  {m.lastText} · pencere {fmtDateTime(m.windowEndsAt)} kapanıyor
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || selected.length === 0}
          onClick={() =>
            run(
              () => replyMissedConversations(clientId, selected, missed.filter((m) => !selected.includes(m.id)).map((m) => m.id)),
              "Seçilenler AI'a gönderildi; diğerleri listeden çıkarıldı."
            )
          }
          className={btnPrimary}
        >
          Seçilenleri cevaplat ({selected.length})
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => replyMissedConversations(clientId, [], missed.map((m) => m.id)), "Liste temizlendi.")} className={btnSecondary}>
          Hiçbirini cevaplama
        </button>
        <Feedback error={error} info={info} />
      </div>
    </section>
  );
}
