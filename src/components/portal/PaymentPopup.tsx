"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/format";

const SEEN_KEY = "portal-payment-popup-seen";

/** "Sadece girişte pencere" bildirim türündeki müşteriye, gecikmiş ödemesi varsa oturum başına bir kez bakiyesini gösterir. */
export function PaymentPopup({ amount, count }: { amount: number; count: number }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* depolama kapalıysa her açılışta gösterilir */
    }
    if (!seen) ref.current?.showModal();
  }, []);

  const close = () => {
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* yoksay */
    }
    ref.current?.close();
  };

  return (
    <dialog
      ref={ref}
      onCancel={close}
      className="m-auto w-[calc(100%-1.5rem)] max-w-sm rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/60"
    >
      <div className="space-y-4 p-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600/10 text-brand-600">
          <AlertTriangle size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold">Ödeme hatırlatması</h2>
          <p className="mt-1 text-sm text-(--color-text-muted)">
            {count} kalemde gecikmiş ödemeniz bulunuyor.
          </p>
          <p className="mt-3 text-2xl font-extrabold text-brand-600">{formatCurrency(amount)}</p>
          <p className="text-xs text-(--color-text-muted)">gecikmiş bakiye (KDV dahil)</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/panel/odemeler"
            onClick={close}
            className="flex-1 rounded-lg bg-brand-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-700"
          >
            Ödemeleri gör
          </Link>
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-(--color-border) px-4 py-2.5 text-sm font-medium hover:bg-(--color-surface-muted)"
          >
            Kapat
          </button>
        </div>
      </div>
    </dialog>
  );
}
