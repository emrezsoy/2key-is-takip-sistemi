"use client";

import { useRef, useState } from "react";
import { addManualAppointment, cancelAppointment, regenerateCalendarToken, saveAvailability } from "@/lib/actions/dmModules";
import { WEEKDAYS } from "@/lib/dm/hours";
import { useAction } from "../useAction";
import { Feedback } from "../Feedback";
import { btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "../ui";

type Weekly = { weekday: number; startTime: string; endTime: string };
type Closed = { from: string; to: string; note?: string };

/** Çalışma kuralları: haftalık açık saatler (günde birden çok aralık) ve kapalı tarihler. */
export function AvailabilityEditor({ clientId, weekly, closed, durationMin, gapMin }: { clientId: string; weekly: Weekly[]; closed: Closed[]; durationMin: number; gapMin: number }) {
  const [w, setW] = useState<Weekly[]>(weekly);
  const [c, setC] = useState<Closed[]>(closed);
  const [dur, setDur] = useState(String(durationMin));
  const [gap, setGap] = useState(String(gapMin));
  const { pending, error, info, run } = useAction();
  return (
    <section id="calisma-kurallari" className={`${cardCls} space-y-3`}>
      <div>
        <h3 className="text-sm font-bold">Çalışma kuralları</h3>
        <p className="text-xs text-(--color-text-muted)">
          AI yalnızca bu saatlerde, diğer randevularla çakışmayan zamanları önerir. Çalışma saati girilmezse AI randevu oluşturamaz.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          <span className={labelCls}>Randevu süresi (dk)</span>
          <input type="number" min={5} max={600} step={5} value={dur} onChange={(e) => setDur(e.target.value)} className={`${inputCls} w-28`} />
        </label>
        <label className="text-sm">
          <span className={labelCls}>İki randevu arası (dk)</span>
          <input type="number" min={0} max={240} step={5} value={gap} onChange={(e) => setGap(e.target.value)} className={`${inputCls} w-28`} />
        </label>
      </div>
      <div className="space-y-1.5">
        {WEEKDAYS.map((name, i) => {
          const d = i + 1;
          const rows = w.map((r, idx) => ({ r, idx })).filter((x) => x.r.weekday === d);
          return (
            <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-24 font-medium">{name}</span>
              {rows.length === 0 && <span className="text-xs text-(--color-text-muted)">kapalı</span>}
              {rows.map(({ r, idx }) => (
                <span key={idx} className="flex items-center gap-1">
                  <input type="time" value={r.startTime} onChange={(e) => setW(w.map((x, j) => (j === idx ? { ...x, startTime: e.target.value } : x)))} className={`${inputCls} w-28`} />
                  –
                  <input type="time" value={r.endTime} onChange={(e) => setW(w.map((x, j) => (j === idx ? { ...x, endTime: e.target.value } : x)))} className={`${inputCls} w-28`} />
                  <button type="button" onClick={() => setW(w.filter((_, j) => j !== idx))} className="px-1 text-(--color-text-muted) hover:text-brand-600" aria-label="Kaldır">
                    ×
                  </button>
                </span>
              ))}
              <button type="button" onClick={() => setW([...w, { weekday: d, startTime: "09:00", endTime: "18:00" }])} className="text-xs font-semibold text-brand-600">
                + aralık
              </button>
            </div>
          );
        })}
      </div>
      <div className="space-y-1.5">
        <h4 className="text-sm font-semibold">Kapalı tarihler</h4>
        {c.map((x, idx) => (
          <div key={idx} className="flex flex-wrap items-center gap-2">
            <input type="date" value={x.from} onChange={(e) => setC(c.map((y, j) => (j === idx ? { ...y, from: e.target.value } : y)))} className={`${inputCls} w-40`} />
            –
            <input type="date" value={x.to} onChange={(e) => setC(c.map((y, j) => (j === idx ? { ...y, to: e.target.value } : y)))} className={`${inputCls} w-40`} />
            <input value={x.note ?? ""} onChange={(e) => setC(c.map((y, j) => (j === idx ? { ...y, note: e.target.value } : y)))} className={`${inputCls} w-48`} placeholder="Not (ör. yıllık izin)" />
            <button type="button" onClick={() => setC(c.filter((_, j) => j !== idx))} className="text-(--color-text-muted) hover:text-brand-600">
              ×
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setC([...c, { from: "", to: "" }])} className="text-xs font-semibold text-brand-600">
          + kapalı tarih ekle
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" disabled={pending} onClick={() => run(() => saveAvailability(clientId, { weekly: w, closed: c, durationMin: Number(dur), gapMin: Number(gap) }), "Kaydedildi.")} className={btnPrimary}>
          Kaydet
        </button>
        <Feedback error={error} info={info} />
      </div>
    </section>
  );
}

export function ManualAppointmentForm({ clientId }: { clientId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const { pending, error, info, run } = useAction();
  return (
    <form
      ref={ref}
      className={`${cardCls} space-y-2`}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => addManualAppointment(clientId, fd), "Randevu eklendi (dolu sayılır).", () => ref.current?.reset());
      }}
    >
      <h3 className="text-sm font-bold">Elle randevu ekle</h3>
      <p className="text-xs text-(--color-text-muted)">Telefonla / yüz yüze alınan randevular; AI bu saatleri dolu sayar.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label className={labelCls}>Tarih ve saat</label>
          <input name="start" type="datetime-local" className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>Süre (dk, boşsa varsayılan)</label>
          <input name="duration" type="number" min={5} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Ad</label>
          <input name="name" className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>Telefon</label>
          <input name="phone" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Hizmet</label>
          <input name="service" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Not</label>
          <input name="note" className={inputCls} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnSecondary}>
          Ekle
        </button>
        <Feedback error={error} info={info} />
      </div>
    </form>
  );
}

export function CancelAppointmentButton({ id }: { id: string }) {
  const { pending, run } = useAction();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("Randevu iptal edilsin mi? Kişiye otomatik mesaj gitmez.")) run(() => cancelAppointment(id));
      }}
      className="text-xs text-(--color-text-muted) hover:text-brand-600"
    >
      İptal
    </button>
  );
}

export function CalendarFeed({ clientId, url }: { clientId: string; url: string | null }) {
  const [link, setLink] = useState(url);
  const { pending, error, run } = useAction();
  return (
    <section className={`${cardCls} space-y-2`}>
      <h3 className="text-sm font-bold">Google Takvim&apos;e abone ol</h3>
      <p className="text-xs text-(--color-text-muted)">
        Google Takvim → Diğer takvimler → &quot;URL ile&quot; → aşağıdaki adresi yapıştırın. Randevular takviminizde otomatik görünür. Adres gizlidir; paylaşmayın.
      </p>
      {link ? <code className="block break-all rounded bg-(--color-surface-muted) p-2 text-xs">{link}</code> : <p className="text-xs">Henüz takvim adresi oluşturulmadı.</p>}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(async () => setLink(`${window.location.origin}/api/dm/calendar/${await regenerateCalendarToken(clientId)}.ics`))}
          className={btnSecondary}
        >
          {link ? "Adresi yenile (eskisi çalışmaz)" : "Takvim adresi oluştur"}
        </button>
        {link && (
          <button type="button" onClick={() => void navigator.clipboard.writeText(link)} className="text-xs font-semibold text-brand-600">
            Kopyala
          </button>
        )}
      </div>
      <Feedback error={error} info={null} />
    </section>
  );
}
