"use client";

import { PlayCircle } from "lucide-react";
import { TOUR_EVENT } from "@/components/portal/PortalTour";

/** Hesabım: tanıtım turunu baştan başlatır. */
export function RestartTourButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}
      className="flex items-center gap-2 rounded-lg border border-(--color-border) px-4 py-2 text-sm font-semibold hover:bg-(--color-surface-muted)"
    >
      <PlayCircle size={16} /> Panel turunu yeniden başlat
    </button>
  );
}
