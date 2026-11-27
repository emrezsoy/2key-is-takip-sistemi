"use client";

import { saveDmPlan, saveDmPricing, setDmPlanActive } from "@/lib/actions/dmCredits";
import { useAction } from "../useAction";
import { Feedback } from "../Feedback";
import { btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "../ui";

type Plan = { id: string; name: string; monthlyCredits: number; priceNote: string | null; isActive: boolean; sortOrder: number; clientCount: number };
type Pricing = {
  textCost: number; imageCost: number; videoCost: number; followUpCost: number; cachedMediaCost: number;
  negativeLimit: number; graceDays: number; renewalNoticeDays: number; lowAlertPercents: number[];
};

function PlanRow({ plan }: { plan?: Plan }) {
  const { pending, error, info, run } = useAction();
  return (
    <form
      className="grid items-end gap-2 border-b border-(--color-border) py-3 last:border-0 sm:grid-cols-[1.4fr_0.8fr_1.4fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const form = e.currentTarget;
        run(() => saveDmPlan(fd), plan ? "Kaydedildi." : "Paket eklendi.", () => { if (!plan) form.reset(); });
      }}
    >
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <div>
        <label className={labelCls}>Paket adı</label>
        <input name="name" defaultValue={plan?.name} className={inputCls} required />
      </div>
      <div>
        <label className={labelCls}>Aylık kredi</label>
        <input name="monthlyCredits" type="number" min={1} defaultValue={plan?.monthlyCredits} className={inputCls} required />
      </div>
      <div>
        <label className={labelCls}>Fiyat notu (bilgi amaçlı)</label>
        <input name="priceNote" defaultValue={plan?.priceNote ?? ""} className={inputCls} />
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className={plan ? btnSecondary : btnPrimary}>
          {plan ? "Kaydet" : "Ekle"}
        </button>
        {plan && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setDmPlanActive(plan.id, !plan.isActive), plan.isActive ? "Pasife alındı." : "Aktifleştirildi.")}
            className="text-xs font-medium text-(--color-text-muted) hover:text-brand-600"
          >
            {plan.isActive ? "Pasife al" : "Aktifleştir"}
          </button>
        )}
      </div>
      {plan && (
        <p className="text-[11px] text-(--color-text-muted) sm:col-span-4">
          {plan.isActive ? "Aktif" : "Pasif (yeni ödemede seçilemez)"} · {plan.clientCount} müşteride kullanılmış
        </p>
      )}
      <div className="sm:col-span-4">
        <Feedback error={error} info={info} />
      </div>
    </form>
  );
}

export function PlansAndPricing({ plans, pricing }: { plans: Plan[]; pricing: Pricing }) {
  const { pending, error, info, run } = useAction();
  const num = (name: keyof Pricing, label: string, hint?: string) => (
    <div>
      <label className={labelCls}>{label}</label>
      <input name={name} type="number" min={0} defaultValue={pricing[name] as number} className={inputCls} required />
      {hint && <p className="mt-0.5 text-[11px] text-(--color-text-muted)">{hint}</p>}
    </div>
  );
  return (
    <div className="space-y-6">
      <section className={cardCls}>
        <h2 className="text-sm font-bold">Paketler</h2>
        <p className="mb-2 text-xs text-(--color-text-muted)">
          Paket isimleri ve kredi miktarları ilk ayın gerçek maliyet verisine göre netleşecek; buradan istediğiniz zaman değiştirebilirsiniz.
          Değişiklik, girilmiş dönemleri etkilemez (dönem, girildiği andaki aylık krediyi kullanır).
        </p>
        {plans.map((p) => (
          <PlanRow key={p.id} plan={p} />
        ))}
        <div className="mt-2 rounded-lg border border-dashed border-(--color-border) px-3">
          <PlanRow />
        </div>
      </section>

      <form
        className={`${cardCls} space-y-4`}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => saveDmPricing(fd), "Fiyatlar kaydedildi.");
        }}
      >
        <h2 className="text-sm font-bold">Kredi bedelleri ve kurallar</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {num("textCost", "Metin cevap")}
          {num("imageCost", "Görselli cevap")}
          {num("videoCost", "Videolu cevap")}
          {num("followUpCost", "Takip mesajı")}
          {num("cachedMediaCost", "Daha önce analiz edilmiş reklam / post", "Aynı reklam ikinci kez analiz edilmez.")}
          {num("negativeLimit", "Eksi bakiye limiti", "Bakiye en fazla bu kadar eksiye düşebilir.")}
          {num("graceDays", "Ödeme sonrası ek süre (gün)")}
          {num("renewalNoticeDays", "Yenileme bildirimi (bitime kaç gün kala)")}
          <div>
            <label className={labelCls}>Düşük kredi eşikleri (%)</label>
            <input name="lowAlertPercents" defaultValue={pricing.lowAlertPercents.join(", ")} className={inputCls} />
            <p className="mt-0.5 text-[11px] text-(--color-text-muted)">Aylık paket kredisinin yüzdesi; virgülle ayırın.</p>
          </div>
        </div>
        <p className="text-[11px] text-(--color-text-muted)">
          Sınıflandırma, özetleme, kurulum görüşmesi ve kurulum analizi ücretsizdir. Toplu okunan mesaj grubu tek cevap sayılır;
          bedel gruptaki en pahalı yeni içeriğe göre düşer.
        </p>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className={btnPrimary}>
            Kaydet
          </button>
          <Feedback error={error} info={info} />
        </div>
      </form>
    </div>
  );
}
