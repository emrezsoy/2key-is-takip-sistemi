"use client";

import { useRef } from "react";
import { addDmCredit } from "@/lib/actions/dmCredits";
import { useAction } from "../useAction";
import { Feedback } from "../Feedback";
import { btnSecondary, cardCls, inputCls, labelCls } from "../ui";

/** Kalıcı kredi ekleme, düzeltme (+/-) ve iade. */
export function CreditAdjustForm({ clientId }: { clientId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { pending, error, info, run } = useAction();
  return (
    <form
      ref={formRef}
      className={`${cardCls} space-y-3`}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => addDmCredit(clientId, fd), "Kaydedildi.", () => formRef.current?.reset());
      }}
    >
      <h3 className="text-sm font-bold">Kredi ekle / düzelt</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls}>İşlem</label>
          <select name="kind" className={inputCls}>
            <option value="TOPUP">Kalıcı kredi yükle</option>
            <option value="ADJUST_PERMANENT">Düzeltme (kalıcı, +/-)</option>
            <option value="ADJUST_PLAN">Düzeltme (paket, +/-)</option>
            <option value="REFUND">İade (kalıcıya eklenir)</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Kredi</label>
          <input name="amount" type="number" step={1} className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>Not (düzeltmede zorunlu)</label>
          <input name="note" className={inputCls} maxLength={200} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnSecondary}>
          Kaydet
        </button>
        <Feedback error={error} info={info} />
      </div>
    </form>
  );
}
