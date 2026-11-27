"use client";

import { useRef, useState } from "react";
import { recordDmPayment } from "@/lib/actions/dmCredits";
import { useAction } from "../useAction";
import { Feedback } from "../Feedback";
import { btnPrimary, cardCls, inputCls, labelCls } from "../ui";

type Plan = { id: string; name: string; monthlyCredits: number; priceNote: string | null };

/** "Ödeme alındı": paket + ay sayısı + not + isteğe bağlı Finans gelir kaydı. Otomatik yenileme yoktur. */
export function PaymentForm({ clientId, plans }: { clientId: string; plans: Plan[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [months, setMonths] = useState("1");
  const [income, setIncome] = useState(false);
  const { pending, error, info, run } = useAction();

  if (plans.length === 0) {
    return (
      <div className={cardCls}>
        <p className="text-sm">Önce &quot;Paketler ve fiyatlar&quot; sayfasından bir paket tanımlayın.</p>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      className={`${cardCls} space-y-3`}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => recordDmPayment(clientId, fd), "Ödeme kaydedildi; bu ayın paket kredisi yüklendi.", () => {
          formRef.current?.reset();
          setMonths("1");
          setIncome(false);
        });
      }}
    >
      <h3 className="text-sm font-bold">Ödeme alındı</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Paket</label>
          <select name="planId" className={inputCls} required>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — aylık {p.monthlyCredits} kredi{p.priceNote ? ` (${p.priceNote})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Ödenen ay sayısı</label>
          <div className="flex gap-2">
            <select name="months" value={months} onChange={(e) => setMonths(e.target.value)} className={inputCls}>
              <option value="1">1 ay</option>
              <option value="3">3 ay</option>
              <option value="12">12 ay</option>
              <option value="custom">Özel</option>
            </select>
            {months === "custom" && <input name="customMonths" type="number" min={1} max={36} placeholder="Ay" className={`${inputCls} w-24`} required />}
          </div>
        </div>
      </div>
      <div>
        <label className={labelCls}>Not (ör. fatura no)</label>
        <input name="note" className={inputCls} maxLength={200} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="createIncome" checked={income} onChange={(e) => setIncome(e.target.checked)} className="h-4 w-4" />
        Finans&apos;a gelir kaydı oluştur
      </label>
      {income && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Tutar (TL, KDV hariç)</label>
            <input name="amount" inputMode="decimal" className={inputCls} required />
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" name="invoiced" className="h-4 w-4" />
            Faturalı
          </label>
        </div>
      )}
      <p className="text-[11px] text-(--color-text-muted)">
        Dönem, mevcut dönem sürüyorsa (ya da ek süredeyse) kaldığı yerden devam eder. Her ay dönem başlangıç gününde paket kredisi yüklenir,
        önceki ayın kullanılmayan paket kredisi silinir. Otomatik yenileme yoktur; bitime 3 gün kala size bildirim gelir.
      </p>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Kaydediliyor…" : "Ödemeyi kaydet"}
        </button>
        <Feedback error={error} info={info} />
      </div>
    </form>
  );
}
