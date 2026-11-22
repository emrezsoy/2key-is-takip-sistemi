"use client";

import { useEffect, useState } from "react";
import type { DayType } from "@prisma/client";
import { DAY_TYPE_LABEL, formatCurrency } from "@/lib/format";
import { setAttendance } from "@/app/(app)/puantaj/actions";

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const CYCLE: DayType[] = ["NONE", "FULL", "HALF", "LEAVE"];

const PILL_COLOR: Record<DayType, string> = {
  NONE: "",
  FULL: "bg-status-done",
  HALF: "bg-amber-400",
  LEAVE: "bg-ink-400",
};

// Admin görünümünde her çalışana sabit, kimliğine göre (sıralamadan bağımsız)
// atanan yumuşak bir renk. Böylece takvime bakınca "kim ne zaman geliyor"
// renkten anlaşılabiliyor.
// NOT: Tailwind, sınıf isimlerini kaynak dosyada bulunan TAM (literal)
// string olarak tarar. `${dot}/50` gibi çalışma zamanında birleştirilmiş bir
// sınıf ismi taramada görünmez ve CSS'e hiç eklenmez — bu yüzden her varyant
// burada ayrı ayrı sabit string olarak tanımlanıyor.
const EMPLOYEE_PALETTE = [
  { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-800 dark:text-blue-200", dot: "bg-blue-500", dotHalf: "bg-blue-500/50", dotBorder: "border-blue-500" },
  { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-800 dark:text-purple-200", dot: "bg-purple-500", dotHalf: "bg-purple-500/50", dotBorder: "border-purple-500" },
  { bg: "bg-pink-100 dark:bg-pink-900/30", text: "text-pink-800 dark:text-pink-200", dot: "bg-pink-500", dotHalf: "bg-pink-500/50", dotBorder: "border-pink-500" },
  { bg: "bg-teal-100 dark:bg-teal-900/30", text: "text-teal-800 dark:text-teal-200", dot: "bg-teal-500", dotHalf: "bg-teal-500/50", dotBorder: "border-teal-500" },
  { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-800 dark:text-orange-200", dot: "bg-orange-500", dotHalf: "bg-orange-500/50", dotBorder: "border-orange-500" },
  { bg: "bg-cyan-100 dark:bg-cyan-900/30", text: "text-cyan-800 dark:text-cyan-200", dot: "bg-cyan-500", dotHalf: "bg-cyan-500/50", dotBorder: "border-cyan-500" },
  { bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-800 dark:text-indigo-200", dot: "bg-indigo-500", dotHalf: "bg-indigo-500/50", dotBorder: "border-indigo-500" },
  { bg: "bg-rose-100 dark:bg-rose-900/30", text: "text-rose-800 dark:text-rose-200", dot: "bg-rose-500", dotHalf: "bg-rose-500/50", dotBorder: "border-rose-500" },
];

type PersonColor = (typeof EMPLOYEE_PALETTE)[number];

/** Gün tipine göre bir çalışanın renkli noktasının stili (mobil görünüm):
 * tam gün = dolu, yarım gün = yarı saydam dolu, izinli = sadece çerçeve. */
function dotStyleFor(personColor: PersonColor, dt: DayType) {
  if (dt === "HALF") return personColor.dotHalf;
  if (dt === "LEAVE") return `bg-transparent border-2 ${personColor.dotBorder}`;
  return personColor.dot;
}

/** Görünürdeki çalışan listesine göre her kişiye çakışmasız bir renk atar
 * (id'ye göre sabit sıralama kullanır, böylece atama tutarlı kalır). */
function buildEmployeeColorMap(employees: { id: string }[]) {
  const sortedIds = [...employees.map((e) => e.id)].sort();
  const map = new Map<string, (typeof EMPLOYEE_PALETTE)[number]>();
  sortedIds.forEach((id, i) => {
    map.set(id, EMPLOYEE_PALETTE[i % EMPLOYEE_PALETTE.length]);
  });
  return map;
}

// Gün tipi rozeti (çubuğun sağ ucundaki küçük etiket): eskisi gibi dolu/
// canlı değil, soft ve düşük opaklıklı — okunabilirlik için.
const DAY_TYPE_BADGE: Record<DayType, string> = {
  NONE: "",
  FULL: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  HALF: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  LEAVE: "bg-ink-500/15 text-ink-700 dark:bg-ink-300/15 dark:text-ink-300",
};

type Employee = {
  id: string;
  fullName: string;
  paymentType: "DAILY" | "MONTHLY";
  dailyRate: number | null;
  monthlyRate: number | null;
};

type AttendanceMap = Record<string, Record<number, DayType>>;

export function AttendanceCalendar({
  year,
  month,
  employees,
  initialAttendance,
  editable,
  showSummary = true,
}: {
  year: number;
  month: number;
  employees: Employee[];
  initialAttendance: AttendanceMap;
  editable: boolean;
  showSummary?: boolean;
}) {
  const [attendance, setAttendanceState] = useState(initialAttendance);
  const [selectedId, setSelectedId] = useState(employees[0]?.id ?? "");
  const showNames = employees.length > 1;
  const employeeColorMap = buildEmployeeColorMap(employees);

  // Sunucu bileşeni yeni ay/veri ile yeniden render olduğunda yerel state'i
  // senkronize et. Bu olmadan ay değiştirince önceki ayda işaretlenen gün
  // numaraları (ör. 16/17/18) yeni ayın aynı gün numaralarında da işaretli
  // görünüyordu; oysa günler haftanın farklı günlerine denk geliyor.
  useEffect(() => {
    setAttendanceState(initialAttendance);
  }, [initialAttendance]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayIdx = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(firstDayIdx).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  const cycleDay = (userId: string, day: number) => {
    if (!editable || !userId) return;
    const current = attendance[userId]?.[day] ?? "NONE";
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];

    setAttendanceState((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], [day]: next },
    }));

    const dateISO = new Date(Date.UTC(year, month - 1, day)).toISOString();
    setAttendance(userId, dateISO, next).catch(() => {
      setAttendanceState((prev) => ({
        ...prev,
        [userId]: { ...prev[userId], [day]: current },
      }));
    });
  };

  const monthTotal = (userId: string) => {
    const rec = attendance[userId] ?? {};
    return Object.values(rec).reduce((sum, dt) => {
      if (dt === "FULL") return sum + 1;
      if (dt === "HALF") return sum + 0.5;
      return sum;
    }, 0);
  };

  const payout = (e: Employee) =>
    e.paymentType === "MONTHLY" ? (e.monthlyRate ?? 0) : monthTotal(e.id) * (e.dailyRate ?? 0);

  if (employees.length === 0) {
    return <p className="text-sm text-(--color-text-muted)">Kayıtlı çalışan yok.</p>;
  }

  return (
    <div className="space-y-4">
      {editable && employees.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-(--color-text-muted)">
            Boş güne tıklayınca işaretlenecek kişi:
          </span>
          {employees.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setSelectedId(e.id)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                e.id === selectedId
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300"
                  : "border-(--color-border) text-(--color-text-muted) hover:bg-(--color-surface-muted)"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white ${employeeColorMap.get(e.id)!.dot}`}
              >
                {e.fullName.charAt(0).toUpperCase()}
              </span>
              {e.fullName}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-(--color-border) bg-(--color-surface-muted)">
        <div className="grid grid-cols-7 border-b border-(--color-border) text-center text-xs font-semibold">
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              className={`py-2 ${i >= 5 ? "text-brand-600" : "text-(--color-text-muted)"}`}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-(--color-border)">
          {cells.map((day, i) => {
            const isWeekend = i % 7 >= 5;
            const isToday = day && isCurrentMonth && day === today.getDate();
            const dayEntries = day
              ? employees
                  .map((e) => ({ e, dt: attendance[e.id]?.[day] ?? "NONE" }))
                  .filter(({ dt }) => dt !== "NONE")
              : [];

            return (
              <div
                key={i}
                onClick={() => day && editable && cycleDay(selectedId, day)}
                className={`flex ${editable ? "min-h-20 sm:min-h-32" : "min-h-24"} flex-col gap-1 border p-1.5 text-left align-top ${
                  day ? "bg-(--color-surface)" : "bg-(--color-surface-muted) border-transparent"
                } ${editable && day ? "cursor-pointer hover:brightness-95" : ""} ${
                  isToday ? "border-brand-500" : "border-transparent"
                }`}
              >
                {day && (
                  <>
                    <span
                      className={`text-xs font-semibold ${
                        isWeekend ? "text-brand-600" : "text-(--color-text)"
                      }`}
                    >
                      {day}
                    </span>
                    {editable ? (
                      <>
                        {/* Masaüstü: isim + durum rozetli tam çubuk */}
                        <div className="hidden space-y-0.5 sm:block">
                          {dayEntries.map(({ e, dt }) => {
                            const personColor = employeeColorMap.get(e.id)!;
                            return (
                              <button
                                key={e.id}
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  cycleDay(e.id, day);
                                }}
                                title={`${e.fullName} — ${DAY_TYPE_LABEL[dt]}`}
                                className={`flex w-full cursor-pointer items-center justify-between gap-1 rounded px-1.5 py-0.5 text-left text-[10px] font-semibold hover:brightness-95 ${personColor.bg} ${personColor.text}`}
                              >
                                {showNames && <span className="truncate">{e.fullName}</span>}
                                <span
                                  className={`shrink-0 rounded px-1 py-0.5 font-semibold ${DAY_TYPE_BADGE[dt]}`}
                                >
                                  {DAY_TYPE_LABEL[dt]}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {/* Mobil: dar sütunlarda isim sığmadığı için renkli
                            nokta göstergesi — dolu: tam gün, soluk: yarım
                            gün, sadece çerçeve: izinli. */}
                        <div className="flex flex-wrap gap-1 sm:hidden">
                          {dayEntries.map(({ e, dt }) => {
                            const personColor = employeeColorMap.get(e.id)!;
                            return (
                              <button
                                key={e.id}
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  cycleDay(e.id, day);
                                }}
                                title={`${e.fullName} — ${DAY_TYPE_LABEL[dt]}`}
                                aria-label={`${e.fullName} — ${DAY_TYPE_LABEL[dt]}`}
                                className={`h-3.5 w-3.5 shrink-0 rounded-full ${dotStyleFor(personColor, dt)}`}
                              />
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="space-y-0.5">
                        {dayEntries.map(({ e, dt }) => (
                          <button
                            key={e.id}
                            type="button"
                            disabled
                            title={`${e.fullName} — ${DAY_TYPE_LABEL[dt]}`}
                            className={`flex w-full cursor-default items-center justify-between gap-1 rounded px-1.5 py-0.5 text-left text-[10px] font-semibold text-white ${PILL_COLOR[dt]}`}
                          >
                            {showNames && <span className="truncate">{e.fullName}</span>}
                            <span className="shrink-0 font-normal opacity-90">
                              {DAY_TYPE_LABEL[dt]}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showSummary && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {employees.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-2 text-sm"
            >
              <span className="font-medium">{e.fullName}</span>
              <span className="text-(--color-text-muted)">
                {e.paymentType === "MONTHLY" ? (
                  <span className="text-[11px] uppercase tracking-wide">Aylık net ·{" "}</span>
                ) : (
                  <>{monthTotal(e.id)} gün · </>
                )}
                <span className="font-semibold text-(--color-text)">
                  {formatCurrency(payout(e))}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
