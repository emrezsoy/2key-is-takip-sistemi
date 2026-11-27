"use client";

import { resolveDmCreditRequest } from "@/lib/actions/dmCredits";
import { useAction } from "../useAction";

export function ResolveCreditRequestButton({ id }: { id: string }) {
  const { pending, run } = useAction();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(() => resolveDmCreditRequest(id))}
      className="shrink-0 text-xs font-medium text-(--color-text-muted) hover:text-brand-600"
    >
      Kapat
    </button>
  );
}
