"use client";

// Sınıf adları tam literal tutulmalı (Tailwind taraması için).
const OPTIONS = [
  {
    value: "URGENT",
    label: "Acil",
    dot: "bg-red-500",
    on: "peer-checked:border-red-500 peer-checked:bg-red-50 dark:peer-checked:bg-red-900/20",
  },
  {
    value: "HIGH",
    label: "Yüksek",
    dot: "bg-orange-500",
    on: "peer-checked:border-orange-500 peer-checked:bg-orange-50 dark:peer-checked:bg-orange-900/20",
  },
  {
    value: "MEDIUM",
    label: "Orta",
    dot: "bg-amber-400",
    on: "peer-checked:border-amber-400 peer-checked:bg-amber-50 dark:peer-checked:bg-amber-900/20",
  },
  {
    value: "LOW",
    label: "Düşük",
    dot: "bg-sky-400",
    on: "peer-checked:border-sky-400 peer-checked:bg-sky-50 dark:peer-checked:bg-sky-900/20",
  },
] as const;

export function UrgencyPicker({
  defaultValue = "MEDIUM",
  name = "urgency",
}: {
  defaultValue?: string;
  name?: string;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {OPTIONS.map((o) => (
        <label key={o.value} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={o.value}
            defaultChecked={o.value === defaultValue}
            className="peer sr-only"
          />
          <span
            className={`flex items-center justify-center gap-1.5 rounded-lg border border-(--color-border) px-2 py-2 text-xs font-semibold transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 ${o.on}`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${o.dot}`} />
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}
