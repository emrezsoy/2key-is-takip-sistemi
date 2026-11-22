import type { ComponentType } from "react";

export function StatCard({
  icon: Icon,
  value,
  label,
  accent = "brand",
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  value: number | string;
  label: string;
  accent?: "brand" | "green";
}) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--color-surface-muted) text-(--color-text-muted)">
          <Icon size={18} />
        </span>
        <div>
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="mt-1 text-xs text-(--color-text-muted)">{label}</p>
        </div>
      </div>
      <div
        className={`mt-3 h-1 w-10 rounded-full ${
          accent === "green" ? "bg-status-done" : "bg-brand-600"
        }`}
      />
    </div>
  );
}
