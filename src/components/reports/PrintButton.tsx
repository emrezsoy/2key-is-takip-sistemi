"use client";

import { Printer } from "lucide-react";

/** Raporu yazdırır; tarayıcıda "PDF olarak kaydet" seçilerek PDF alınır. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print flex items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs font-semibold hover:bg-(--color-surface-muted)"
    >
      <Printer size={14} />
      Yazdır / PDF
    </button>
  );
}
