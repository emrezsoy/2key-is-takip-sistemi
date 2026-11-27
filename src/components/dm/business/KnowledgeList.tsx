"use client";

import { useState } from "react";
import { saveKnowledgeItem, setKnowledgeActive } from "@/lib/actions/dmConfig";
import { useAction } from "../useAction";
import { Feedback } from "../Feedback";
import { btnSecondary, cardCls, inputCls } from "../ui";

type Item = { id: string; question: string; answer: string; isActive: boolean; source: string };

function Row({ clientId, item }: { clientId: string; item?: Item }) {
  const [q, setQ] = useState(item?.question ?? "");
  const [a, setA] = useState(item?.answer ?? "");
  const { pending, error, info, run } = useAction();
  const dirty = q !== (item?.question ?? "") || a !== (item?.answer ?? "");
  return (
    <li className={`space-y-1.5 border-b border-(--color-border) py-2 last:border-0 ${item && !item.isActive ? "opacity-50" : ""}`}>
      <input value={q} onChange={(e) => setQ(e.target.value)} className={`${inputCls} font-medium`} placeholder="Soru (ör. Kargo kaç günde gelir?)" />
      <textarea value={a} onChange={(e) => setA(e.target.value)} rows={2} className={inputCls} placeholder="Cevap" />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !dirty || !q.trim() || !a.trim()}
          onClick={() => run(() => saveKnowledgeItem(clientId, { id: item?.id, question: q, answer: a }), "Kaydedildi.", () => { if (!item) { setQ(""); setA(""); } })}
          className={btnSecondary}
        >
          {item ? "Kaydet" : "Ekle"}
        </button>
        {item && (
          <button type="button" disabled={pending} onClick={() => run(() => setKnowledgeActive(item.id, !item.isActive))} className="text-xs text-(--color-text-muted) hover:text-brand-600">
            {item.isActive ? "Pasife al" : "Aktifleştir"}
          </button>
        )}
        <Feedback error={error} info={info} />
      </div>
    </li>
  );
}

export function KnowledgeList({ clientId, items }: { clientId: string; items: Item[] }) {
  return (
    <section className={cardCls}>
      <h3 className="text-sm font-bold">Bilgi bankası</h3>
      <p className="text-xs text-(--color-text-muted)">
        AI&apos;ın cevaplarken kullandığı soru-cevaplar. AI&apos;ın sorduğu sorulara verdiğiniz cevaplar da buraya eklenir.
      </p>
      <ul>
        <Row clientId={clientId} />
        {items.map((i) => (
          <Row key={i.id} clientId={clientId} item={i} />
        ))}
      </ul>
    </section>
  );
}
