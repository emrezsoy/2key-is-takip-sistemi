"use client";

import { useState } from "react";

export type BarDatum = { label: string; value: number };

export function BarChart({
  data,
  unit = "",
  height = 160,
}: {
  data: BarDatum[];
  unit?: string;
  height?: number;
}) {
  const formatValue = (v: number) => (unit ? `${v} ${unit}` : String(v));
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const barWidth = 100 / data.length;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="Çubuk grafik"
      >
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={100}
            y1={height - height * f}
            y2={height - height * f}
            stroke="currentColor"
            strokeWidth={0.5}
            className="text-(--color-border)"
          />
        ))}

        {data.map((d, i) => {
          const barH = max === 0 ? 0 : (d.value / max) * (height - 20);
          const x = i * barWidth;
          const isHover = hover === i;
          return (
            <g key={d.label}>
              <rect
                x={x + barWidth * 0.2}
                y={height - barH}
                width={barWidth * 0.6}
                height={Math.max(barH, d.value > 0 ? 2 : 0)}
                rx={2}
                className={isHover ? "fill-brand-700" : "fill-brand-600"}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
              <rect
                x={x}
                y={0}
                width={barWidth}
                height={height}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>

      <div className="mt-1 flex text-[10px] text-(--color-text-muted)">
        {data.map((d, i) => (
          <span
            key={d.label}
            style={{ width: `${barWidth}%` }}
            className={`truncate text-center ${hover === i ? "font-semibold text-(--color-text)" : ""}`}
          >
            {d.label}
          </span>
        ))}
      </div>

      {hover !== null && (
        <div
          className="pointer-events-none absolute -top-2 -translate-x-1/2 -translate-y-full rounded-md border border-(--color-border) bg-(--color-surface) px-2 py-1 text-xs font-semibold shadow-card"
          style={{ left: `${(hover + 0.5) * barWidth}%` }}
        >
          {formatValue(data[hover].value)}
        </div>
      )}
    </div>
  );
}
