"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

/** Açık / koyu tema seçimi (seçim bu cihazda hatırlanır). */
export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const options = [
    { key: "light", label: "Açık", icon: Sun },
    { key: "dark", label: "Koyu", icon: Moon },
  ] as const;
  return (
    <div className="inline-flex rounded-lg bg-(--color-surface-muted) p-1 text-sm font-semibold">
      {options.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => setTheme(key)}
          aria-pressed={theme === key}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 transition-colors ${
            theme === key ? "bg-(--color-surface) shadow-sm" : "text-(--color-text-muted)"
          }`}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  );
}
