"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Send, Trash2 } from "lucide-react";
import { deleteClientReport, generateClientReport, sendClientReport, setAutoMonthlyReport } from "@/lib/actions/reports";

const selectCls =
  "rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500";

/** Seçici: seçilince adres parametresi değişir (sayfa sunucuda yeniden hesaplanır). */
export function ParamSelect({
  param,
  value,
  options,
  base,
  label,
}: {
  param: string;
  value: string;
  options: { value: string; label: string }[];
  /** Diğer sabit parametreler (sekme, müşteri...). */
  base: Record<string, string>;
  label: string;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-(--color-text-muted)">{label}</span>
      <select
        value={value}
        onChange={(e) => {
          const qs = new URLSearchParams({ ...base, [param]: e.target.value });
          router.push(`/rapor?${qs.toString()}`);
        }}
        className={selectCls}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** "Rapor oluştur": raporu kaydeder ve kayıtlı raporu açar (oradan müşteriye gönderilir). */
export function GenerateButton({ clientId, year, month }: { clientId: string; year: number; month: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="no-print flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              const id = await generateClientReport(clientId, year, month);
              router.push(`/rapor/kayit/${id}`);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Rapor oluşturulamadı.");
            }
          })
        }
        className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        <FilePlus2 size={15} />
        {pending ? "Oluşturuluyor..." : "Rapor oluştur"}
      </button>
      {error && <span className="text-xs font-medium text-brand-600">{error}</span>}
    </div>
  );
}

/** Kayıtlı rapor: müşteriye gönder (yayınla) ve sil. */
export function StoredReportActions({ reportId, published, clientName }: { reportId: string; published: boolean; clientName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      {!published && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`Bu rapor ${clientName} müşterisinin paneline eklenecek ve müşteriye bildirim gidecek. Gönderilsin mi?`)) return;
            start(async () => {
              setError(null);
              try {
                await sendClientReport(reportId);
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Gönderilemedi.");
              }
            });
          }}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          <Send size={15} />
          {pending ? "Gönderiliyor..." : "Müşteriye gönder"}
        </button>
      )}
      {confirmDelete ? (
        <span className="flex items-center gap-2 text-xs">
          <span className="text-(--color-text-muted)">{published ? "Müşteri panelinden de kalkar. " : ""}Silinsin mi?</span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await deleteClientReport(reportId);
                router.push("/rapor?sekme=musteri");
              })
            }
            className="font-semibold text-brand-600 hover:underline"
          >
            Evet, sil
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="text-(--color-text-muted) hover:underline">
            Vazgeç
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirmDelete(true)} className="flex items-center gap-1 px-2 text-xs text-(--color-text-muted) hover:text-brand-600">
          <Trash2 size={13} /> Sil
        </button>
      )}
      {error && <span className="text-xs font-medium text-brand-600">{error}</span>}
    </div>
  );
}

/** Otomatik aylık rapor anahtarı (müşteri başına). */
export function AutoReportToggle({ clientId, on }: { clientId: string; on: boolean }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(on);
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setValue(next);
          start(async () => {
            try {
              await setAutoMonthlyReport(clientId, next);
            } catch {
              setValue(!next);
            }
          });
        }}
        className="h-4 w-4"
      />
      {value ? "Açık" : "Kapalı"}
    </label>
  );
}
