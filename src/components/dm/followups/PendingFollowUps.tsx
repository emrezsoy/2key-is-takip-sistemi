"use client";

import { approveAllFollowUps, decideFollowUp } from "@/lib/actions/dmModules";
import { useAction } from "../useAction";
import { Feedback } from "../Feedback";
import { btnPrimary, btnSecondary, cardCls, fmtDateTime } from "../ui";

type Item = { id: string; text: string; reason: string | null; scheduledAt: Date; windowEndsAt: Date; name: string; conversationId: string };

export function PendingFollowUps({ clientId, items }: { clientId: string; items: Item[]; basePath: string }) {
  const { pending, error, info, run } = useAction();
  return (
    <section className={cardCls}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold">Takip mesajı onayı</h3>
        <button type="button" disabled={pending} onClick={() => run(() => approveAllFollowUps(clientId), "Hepsi onaylandı.")} className={btnPrimary}>Hepsini onayla</button>
      </div>
      <ul>
        {items.map((f) => (
          <li key={f.id} className="space-y-1 border-b border-(--color-border) py-2 text-sm last:border-0">
            <p className="text-xs text-(--color-text-muted)">{f.name} · gönderim {fmtDateTime(f.scheduledAt)} · pencere {fmtDateTime(f.windowEndsAt)}{f.reason ? ` · ${f.reason}` : ""}</p>
            <p>{f.text}</p>
            <div className="flex gap-2">
              <button type="button" disabled={pending} onClick={() => run(() => decideFollowUp(f.id, true), "Onaylandı.")} className={btnSecondary}>Onayla</button>
              <button type="button" disabled={pending} onClick={() => run(() => decideFollowUp(f.id, false), "Çıkarıldı.")} className={btnSecondary}>Gönderme</button>
            </div>
          </li>
        ))}
      </ul>
      <Feedback error={error} info={info} />
    </section>
  );
}
