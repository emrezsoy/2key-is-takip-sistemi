"use client";

import { LayoutGrid, Moon, Sun } from "lucide-react";
import { leaveDmApp, useDmTheme } from "./DmAppShell";

const row = "flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px]";

export function ThemeRow() {
  const { theme, setTheme } = useDmTheme();
  const dark = theme === "dark";
  return (
    <button type="button" onClick={() => setTheme(dark ? "light" : "dark")} className={row} role="switch" aria-checked={dark}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-white">{dark ? <Moon size={17} /> : <Sun size={17} />}</span>
      Gece modu
      <span className={`ml-auto flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${dark ? "bg-brand-500" : "bg-(--color-border)"}`}>
        <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${dark ? "translate-x-5" : ""}`} />
      </span>
    </button>
  );
}

export function LeaveRow() {
  return (
    <button type="button" onClick={leaveDmApp} className={row}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-600 text-white">
        <LayoutGrid size={17} />
      </span>
      Sisteme dön
      <span className="ml-auto text-[12px] text-(--color-text-muted)">İşler, içerik, ödemeler</span>
    </button>
  );
}
