"use client";

import { useState, useTransition } from "react";

/** Sunucu eylemini çalıştırır; hata / bilgi mesajını tutar. */
export function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>, ok?: string, after?: () => void) => {
    setError(null);
    setInfo(null);
    start(async () => {
      try {
        await fn();
        if (ok) setInfo(ok);
        after?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Bir hata oluştu.");
      }
    });
  };
  return { pending, error, info, run, setError, setInfo };
}
