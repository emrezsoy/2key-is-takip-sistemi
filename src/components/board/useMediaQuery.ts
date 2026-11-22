"use client";

import { useSyncExternalStore } from "react";

/** Ekran genişliği koşulunu (ör. "(min-width: 1280px)") reaktif olarak izler.
 * Sunucuda ve ilk render'da false döner. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}
