"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import type { Urgency } from "@prisma/client";
import { approveClientRequest, rejectClientRequest } from "@/lib/actions/clientRequests";

/** Bekleyen müşteri talebi için onayla / reddet düğmeleri (aciliyeti değiştirme ve not ekleme dahil). */
export function RequestReview({
  requestId,
  urgency,
  isRevision = false,
}: {
  requestId: string;
  urgency: Urgency;
  /** Müşteri revizesi: onaylanınca yeni iş açılmaz, mevcut işin kartına not ve dosya olarak eklenir. */
  isRevision?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [level, setLevel] = useState<Urgency>(urgency);

  const submit = () =>
    startTransition(async () => {
      setError(null);
      try {
        if (mode === "approve") await approveClientRequest(requestId, { urgency: level, note });
        else await rejectClientRequest(requestId, note);
        setMode(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "İşlem yapılamadı.");
      }
    });

  if (!mode) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("approve")}
          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          <Check size={13} /> Onayla
        </button>
        <button
          type="button"
          onClick={() => setMode("reject")}
          className="flex items-center gap-1 rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-semibold hover:bg-(--color-surface-muted)"
        >
          <X size={13} /> Reddet
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-lg border border-(--color-border) bg-(--color-surface-muted) p-3">
      {mode === "approve" && isRevision && (
        <p className="text-xs text-(--color-text-muted)">
          Onaylarsanız revize notu ve dosyaları ilgili işin kartına eklenir; iş yeniden &quot;Devam ediyor&quot;a döner (yeni kart açılmaz).
        </p>
      )}
      {mode === "approve" && !isRevision && (
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium">Aciliyet:</span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as Urgency)}
            className="rounded-md border border-(--color-border) bg-(--color-bg) px-2 py-1"
          >
            <option value="LOW">Düşük</option>
            <option value="MEDIUM">Orta</option>
            <option value="HIGH">Yüksek</option>
            <option value="URGENT">Acil</option>
          </select>
        </div>
      )}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder={mode === "approve" ? "Müşteriye not (opsiyonel)" : "Red nedeni (müşteri görür)"}
        className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
      />
      {error && <p className="text-xs text-brand-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 ${
            mode === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-brand-600 hover:bg-brand-700"
          }`}
        >
          {pending
            ? "Kaydediliyor..."
            : mode === "approve"
              ? isRevision
                ? "Revizeyi onayla ve işe ekle"
                : "Onayı kaydet ve iş listesine al"
              : "Reddi kaydet"}
        </button>
        <button type="button" onClick={() => setMode(null)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-(--color-text-muted)">
          Vazgeç
        </button>
      </div>
    </div>
  );
}
