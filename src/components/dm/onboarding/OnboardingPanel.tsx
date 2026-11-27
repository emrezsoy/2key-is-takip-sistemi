"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveOnboardingAction, rejectOnboardingAction, startOnboardingAction, submitOnboardingUploadsAction } from "@/lib/actions/dmOnboarding";
import { useAction } from "../useAction";
import { Feedback } from "../Feedback";
import { btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "../ui";
import { VoiceCall } from "./VoiceCall";

type Ob = {
  id: string;
  status: string;
  ownerName: string | null;
  businessName: string | null;
  fields: Record<string, string>;
  analysis: { profile?: string; tone?: string; suggestedModules?: { appointment?: boolean; products?: boolean; media?: boolean } } | null;
  promptDraft: string | null;
} | null;

export function OnboardingPanel({ clientId, clientName, ob, isAdmin }: { clientId: string; clientName: string; ob: Ob; isAdmin: boolean }) {
  const router = useRouter();
  const [owner, setOwner] = useState(ob?.ownerName ?? "");
  const [biz, setBiz] = useState(ob?.businessName ?? clientName);
  const [prompt, setPrompt] = useState(ob?.promptDraft ?? "");
  const [applyModules, setApplyModules] = useState(true);
  const { pending, error, info, run } = useAction();
  const refresh = () => router.refresh();

  const header = (
    <div>
      <h3 className="text-sm font-bold">Sesli kurulum</h3>
      <p className="text-xs text-(--color-text-muted)">
        İşletme sahibiyle 10 dakikalık sesli görüşme; asistan işletmeyi tanır, dosyalar yüklenir, AI analiz eder. Çıktı 2 Key Idea ekibi onaylamadan canlıya geçmez.
      </p>
    </div>
  );

  if (!ob || ob.status === "APPROVED" || ob.status === "REJECTED") {
    return (
      <section className={`${cardCls} space-y-3`}>
        {header}
        {ob?.status === "APPROVED" && <p className="text-xs text-emerald-700 dark:text-emerald-300">Son kurulum onaylandı ve yayında.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className={labelCls}>İşletme sahibinin adı</label>
            <input value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>İşletme adı</label>
            <input value={biz} onChange={(e) => setBiz(e.target.value)} className={inputCls} />
          </div>
        </div>
        <button type="button" disabled={pending} onClick={() => run(() => startOnboardingAction(clientId, owner, biz), undefined, refresh)} className={btnPrimary}>
          {ob ? "Yeni kurulum başlat" : "Kuruluma başla"}
        </button>
        <Feedback error={error} info={info} />
      </section>
    );
  }

  if (ob.status === "DRAFT" || ob.status === "IN_CALL") {
    return (
      <section className={`${cardCls} space-y-3`}>
        {header}
        <VoiceCall onboardingId={ob.id} ownerName={ob.ownerName} onDone={refresh} />
      </section>
    );
  }

  if (ob.status === "UPLOADS") {
    return (
      <form
        className={`${cardCls} space-y-3`}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => submitOnboardingUploadsAction(ob.id, fd), "Gönderildi; analiz birkaç dakika sürebilir.", refresh);
        }}
      >
        {header}
        <p className="text-sm font-semibold">Son adım: fiyat listesi, menü ve ürün görselleri</p>
        <p className="text-xs text-(--color-text-muted)">Fotoğraf, PDF, Excel ya da CSV (en fazla 10 dosya, toplam 12 MB). Görüşmede eksik kalan bir şey varsa nota yazın.</p>
        <input name="files" type="file" multiple accept="image/*,application/pdf,.xlsx,.csv" className="text-sm" />
        <textarea name="note" rows={3} className={inputCls} placeholder="Ek not (isteğe bağlı)" />
        <p className="text-[11px] text-(--color-text-muted)">Kaydedilen bilgiler: {Object.keys(ob.fields).join(", ") || "—"}</p>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending ? "Gönderiliyor…" : "Analize gönder"}
          </button>
          <Feedback error={error} info={info} />
        </div>
      </form>
    );
  }

  if (ob.status === "ANALYZING") {
    return (
      <section className={`${cardCls} space-y-2`}>
        {header}
        <p className="text-sm">Görüşme ve dosyalar analiz ediliyor…</p>
      </section>
    );
  }

  // PENDING_APPROVAL
  if (!isAdmin) {
    return (
      <section className={`${cardCls} space-y-2`}>
        {header}
        <p className="text-sm">Kurulum tamamlandı. 2 Key Idea ekibi asistanınızı kontrol edip yayına alacak; size bildirim gelecek.</p>
      </section>
    );
  }
  const a = ob.analysis ?? {};
  return (
    <section className={`${cardCls} space-y-3 border-amber-300`}>
      {header}
      <p className="text-sm font-semibold">Onay bekliyor</p>
      {a.profile && <p className="text-sm"><b>Profil:</b> {a.profile}</p>}
      {a.tone && <p className="text-sm"><b>Üslup:</b> {a.tone}</p>}
      {a.suggestedModules && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={applyModules} onChange={(e) => setApplyModules(e.target.checked)} className="h-4 w-4" />
          Önerilen modülleri uygula: {[a.suggestedModules.appointment && "randevu", a.suggestedModules.products && "ürün/stok", a.suggestedModules.media !== false && "medya analizi"].filter(Boolean).join(", ") || "yok"}
        </label>
      )}
      <div>
        <label className={labelCls}>AI talimatı (düzenleyebilirsiniz)</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={12} className={`${inputCls} font-mono text-xs`} />
      </div>
      <p className="text-[11px] text-(--color-text-muted)">Onaylanınca: talimat yayına girer; işletme bilgileri, çalışma saatleri ve bilgi bankası maddeleri eklenir.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={() => run(() => approveOnboardingAction(ob.id, prompt, applyModules), "Onaylandı ve yayına alındı.", refresh)} className={btnPrimary}>
          Onayla ve yayına al
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => rejectOnboardingAction(ob.id), "Reddedildi.", refresh)} className={btnSecondary}>
          Reddet
        </button>
        <Feedback error={error} info={info} />
      </div>
    </section>
  );
}
