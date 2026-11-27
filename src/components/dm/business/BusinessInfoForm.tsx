"use client";

import { useState } from "react";
import { saveBusinessInfo } from "@/lib/actions/dmConfig";
import { BUSINESS_FIELDS } from "@/lib/dm/businessFields";
import { WEEKDAYS, type BusinessHours } from "@/lib/dm/hours";
import { useAction } from "../useAction";
import { Feedback } from "../Feedback";
import { btnPrimary, cardCls, inputCls, labelCls } from "../ui";

/** Pratik işletme bilgileri, mesai saatleri ve tatil modu. Kaydedilince hemen geçerli olur (onay gerekmez). */
export function BusinessInfoForm({
  clientId,
  data,
  hours,
  holiday,
  version,
}: {
  clientId: string;
  data: Record<string, string>;
  hours: BusinessHours | null;
  holiday: { on: boolean; message: string; until: string | null };
  version: { n: number; by: string | null; at: Date } | null;
}) {
  const [values, setValues] = useState<Record<string, string>>(data);
  const [h, setH] = useState<BusinessHours>(hours ?? {});
  const [hol, setHol] = useState(holiday);
  const { pending, error, info, run } = useAction();

  const setDay = (d: number, open: boolean) =>
    setH((cur) => {
      const next = { ...cur };
      if (open) next[String(d)] = cur[String(d)]?.length ? cur[String(d)] : [["09:00", "18:00"]];
      else delete next[String(d)];
      return next;
    });
  const setSlot = (d: number, idx: 0 | 1, v: string) =>
    setH((cur) => {
      const slot = [...(cur[String(d)]?.[0] ?? ["09:00", "18:00"])] as [string, string];
      slot[idx] = v;
      return { ...cur, [String(d)]: [slot, ...(cur[String(d)] ?? []).slice(1)] };
    });

  return (
    <form
      className={`${cardCls} space-y-4`}
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveBusinessInfo(clientId, { data: values, hours: Object.keys(h).length ? h : null, holiday: hol }), "Kaydedildi; AI hemen bu bilgileri kullanıyor.");
      }}
    >
      <div>
        <h3 className="text-sm font-bold">İşletme bilgileri</h3>
        <p className="text-xs text-(--color-text-muted)">
          AI fiyat, adres, kargo gibi bilgileri yalnızca buradan ve bilgi bankasından söyler. Değişiklikler hemen geçerli olur.
          {version && ` Son güncelleme: ${version.n}. sürüm${version.by ? `, ${version.by}` : ""}.`}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {BUSINESS_FIELDS.map((f) => (
          <div key={f.key} className={f.long ? "sm:col-span-2" : ""}>
            <label className={labelCls}>{f.label}</label>
            {f.long ? (
              <textarea rows={3} value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} className={inputCls} />
            ) : (
              <input value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} className={inputCls} />
            )}
          </div>
        ))}
      </div>

      <div>
        <h4 className="mb-1 text-sm font-semibold">Mesai saatleri</h4>
        <p className="mb-2 text-xs text-(--color-text-muted)">Hiç gün seçilmezse işletme her zaman açık sayılır. Mesai dışında AI yine cevap verir, kapalı olduğunu da söyler.</p>
        <div className="space-y-1.5">
          {WEEKDAYS.map((name, i) => {
            const d = i + 1;
            const slot = h[String(d)]?.[0];
            return (
              <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex w-28 items-center gap-2">
                  <input type="checkbox" checked={!!slot} onChange={(e) => setDay(d, e.target.checked)} className="h-4 w-4" />
                  {name}
                </label>
                {slot ? (
                  <>
                    <input type="time" value={slot[0]} onChange={(e) => setSlot(d, 0, e.target.value)} className={`${inputCls} w-28`} />
                    <span>–</span>
                    <input type="time" value={slot[1]} onChange={(e) => setSlot(d, 1, e.target.value)} className={`${inputCls} w-28`} />
                  </>
                ) : (
                  <span className="text-xs text-(--color-text-muted)">kapalı</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-(--color-border) p-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={hol.on} onChange={(e) => setHol({ ...hol, on: e.target.checked })} className="h-4 w-4" />
          Tatil modu
        </label>
        {hol.on && (
          <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
            <div>
              <label className={labelCls}>AI&apos;ın söyleyeceği tatil bilgisi</label>
              <input value={hol.message} onChange={(e) => setHol({ ...hol, message: e.target.value })} className={inputCls} placeholder="Ör. 2 Ocak'a kadar siparişler kargolanmıyor." />
            </div>
            <div>
              <label className={labelCls}>Bitiş tarihi (isteğe bağlı)</label>
              <input type="date" value={hol.until ?? ""} onChange={(e) => setHol({ ...hol, until: e.target.value || null })} className={inputCls} />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <Feedback error={error} info={info} />
      </div>
    </form>
  );
}
