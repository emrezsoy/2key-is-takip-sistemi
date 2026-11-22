"use client";

import { useMemo, useState, useTransition } from "react";
import { BarChart3, Download, FileUp, Phone, Search } from "lucide-react";
import { MONTHS } from "@/lib/format";
import { downloadHref } from "@/components/ui/MediaLightbox";
import { setProposalStatus } from "@/lib/actions/proposals";
import {
  KINDS,
  KIND_LABEL,
  SERVICES,
  SERVICE_LABEL,
  SIZE_LABEL,
  STATUSES,
  STATUS_CHIP,
  STATUS_LABEL,
  phoneHref,
} from "@/lib/proposals";
import { computeProposalStats, winRate } from "@/lib/proposalStats";
import { ProposalDetailDialog, UploadVersionDialog } from "./ProposalDialogs";
import { fmtDate, type ProposalRow } from "./types";

const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const pct = (v: number | null) => (v === null ? "—" : `%${Math.round(v * 100)}`);

const selectCls =
  "rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500";

function Kpi({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
      <p className="text-xs text-(--color-text-muted)">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone ?? ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-(--color-text-muted)">{sub}</p>}
    </div>
  );
}

/** Üst üste renkli çubuk: onay / red / revize / bekleyen. */
function StackBar({ t, max }: { t: { approved: number; rejected: number; revision: number; pending: number }; max: number }) {
  const w = (n: number) => `${(n / Math.max(1, max)) * 100}%`;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-(--color-surface-muted)">
      <span className="bg-emerald-500" style={{ width: w(t.approved) }} />
      <span className="bg-red-500" style={{ width: w(t.rejected) }} />
      <span className="bg-amber-400" style={{ width: w(t.revision) }} />
      <span className="bg-slate-400" style={{ width: w(t.pending) }} />
    </div>
  );
}

function Stats({ rows, onMonth }: { rows: ProposalRow[]; onMonth: (key: string) => void }) {
  const s = useMemo(() => computeProposalStats(rows), [rows]);
  const maxMonth = Math.max(1, ...s.months.map((m) => m.total));
  const maxService = Math.max(1, ...s.byService.map((m) => m.total));
  const rate = winRate(s.overall);

  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <BarChart3 size={18} className="text-brand-600" />
        Genel durum
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Verilen teklif" value={s.overall.total} />
        <Kpi label="Onay" value={s.overall.approved} sub={`Onay oranı ${pct(rate)} (sonuçlananlar içinde)`} tone="text-emerald-600" />
        <Kpi label="Red" value={s.overall.rejected} tone="text-red-600" />
        <Kpi label="Revize istendi" value={s.overall.revision} sub="bizden bekleniyor" tone="text-amber-600" />
        <Kpi label="Sonuç bekleniyor" value={s.overall.pending} />
        <Kpi label="Verilen rapor" value={s.reports.given} sub={`${s.reports.converted} tanesi teklife döndü`} />
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Aylara göre teklifler</h3>
              <span className="flex flex-wrap items-center gap-2 text-[10px] text-(--color-text-muted)">
                <i className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Onay
                <i className="inline-block h-2 w-2 rounded-full bg-red-500" /> Red
                <i className="inline-block h-2 w-2 rounded-full bg-amber-400" /> Revize
                <i className="inline-block h-2 w-2 rounded-full bg-slate-400" /> Bekliyor
              </span>
            </div>
            <ul className="space-y-2.5">
              {s.months.map((m) => (
                <li key={m.key}>
                  <button type="button" onClick={() => onMonth(m.key)} className="block w-full text-left" title="Listeyi bu aya göre süz">
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-semibold">{monthLabel(m.key)}</span>
                      <span className="text-(--color-text-muted)">
                        {m.total} teklif · {m.approved} onay · {m.rejected} red
                        {m.reports > 0 ? ` · ${m.reports} rapor` : ""}
                      </span>
                    </div>
                    <StackBar t={m} max={maxMonth} />
                  </button>
                </li>
              ))}
              {s.months.length === 0 && <li className="text-xs text-(--color-text-muted)">Henüz kayıt yok.</li>}
            </ul>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
              <h3 className="mb-3 text-sm font-bold">Hizmete göre (en çok verilenden)</h3>
              <ul className="space-y-2.5">
                {s.byService.map((m) => (
                  <li key={m.key}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-semibold">{m.label}</span>
                      <span className="text-(--color-text-muted)">
                        {m.total} teklif · {m.approved} onay · {m.rejected} red · {pct(winRate(m))}
                      </span>
                    </div>
                    <StackBar t={m} max={maxService} />
                  </li>
                ))}
                {s.byService.length === 0 && <li className="text-xs text-(--color-text-muted)">Henüz teklif yok.</li>}
              </ul>
            </div>
            {s.bySize.length > 0 && (
              <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
                <h3 className="mb-3 text-sm font-bold">Firma büyüklüğüne göre</h3>
                <ul className="grid grid-cols-2 gap-2 text-xs">
                  {s.bySize.map((m) => (
                    <li key={m.key} className="rounded-lg bg-(--color-surface-muted) px-3 py-2">
                      <p className="font-semibold">{m.label}</p>
                      <p className="text-(--color-text-muted)">
                        {m.total} teklif · {m.approved} onay · {pct(winRate(m))}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

const rowTone = (status: string) =>
  status === "REVISION"
    ? "border-amber-400 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-900/10"
    : "border-(--color-border) bg-(--color-surface)";

function Row({
  row,
  onOpen,
  onUpload,
}: {
  row: ProposalRow;
  onOpen: () => void;
  onUpload: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const latest = row.files[0];
  const revisions = row.files.filter((f) => f.type === "REVISION").length;

  const change = (status: string) =>
    start(async () => {
      setError(null);
      try {
        await setProposalStatus(row.id, status);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Durum değiştirilemedi.");
      }
    });

  return (
    <li className={`rounded-xl border p-4 ${rowTone(row.status)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={onOpen} className="max-w-full truncate text-left text-base font-bold hover:text-brand-600">
            {row.companyName}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
            <span className="rounded bg-(--color-surface-muted) px-1.5 py-0.5">{SIZE_LABEL[row.companySize] ?? row.companySize}</span>
            <span
              className={`rounded px-1.5 py-0.5 ${
                row.kind === "REPORT" ? "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300" : "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-200"
              }`}
            >
              {KIND_LABEL[row.kind]}
            </span>
            {row.fromReport && row.kind === "PROPOSAL" && (
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">Rapordan döndü</span>
            )}
            {revisions > 0 && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                Revize {revisions}
              </span>
            )}
            <span className="font-normal text-(--color-text-muted)">{fmtDate(row.date)}</span>
          </div>
        </div>

        <label className="flex shrink-0 flex-col items-end gap-1">
          <span className="sr-only">Sonuç</span>
          <select
            value={row.status}
            disabled={pending}
            onChange={(e) => change(e.target.value)}
            className={`rounded-lg border-0 px-3 py-1.5 text-xs font-bold outline-none ring-1 ring-black/5 ${STATUS_CHIP[row.status]}`}
          >
            {STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {row.services.map((k) => (
          <span key={k} className="rounded-full border border-(--color-border) px-2 py-0.5 text-[11px]">
            {k === "CUSTOM" && row.customService ? `Özel: ${row.customService}` : SERVICE_LABEL[k]}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-(--color-text-muted)">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {row.contactName && <span>{row.contactName}</span>}
          {row.contactPhone && (
            <a href={phoneHref(row.contactPhone)} className="flex items-center gap-1 font-medium text-brand-600 hover:underline">
              <Phone size={12} />
              {row.contactPhone}
            </a>
          )}
          {!row.contactName && !row.contactPhone && <span className="italic">İletişim bilgisi girilmemiş</span>}
        </div>
        {latest && (
          <a
            href={downloadHref(latest.url)}
            download
            title="Son iletilen dosyayı indir"
            className="flex max-w-full items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-surface) px-2.5 py-1.5 font-medium text-(--color-text) hover:border-brand-500 hover:text-brand-600"
          >
            <Download size={13} className="shrink-0" />
            <span className="truncate">
              Son iletilen{latest.type === "REVISION" ? ` (Revize ${latest.version - 1})` : ""}: {latest.name}
            </span>
            <span className="shrink-0 text-(--color-text-muted)">· {fmtDate(latest.date)}</span>
          </a>
        )}
      </div>

      {row.resultNote && <p className="mt-2 line-clamp-2 text-xs text-(--color-text-muted)">Not: {row.resultNote}</p>}

      {row.status === "REVISION" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-100/70 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Teklif revizesi bekleniyor</p>
          <button
            type="button"
            onClick={onUpload}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-600"
          >
            <FileUp size={16} />
            Revize teklifi yükle
          </button>
        </div>
      )}

      {row.kind === "REPORT" && row.status !== "REVISION" && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onUpload}
            className="flex items-center gap-1.5 rounded-lg border border-brand-600 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/10"
          >
            <FileUp size={14} />
            Teklif dosyasını yükle (teklife çevir)
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <button type="button" onClick={onOpen} className="text-xs font-semibold text-brand-600 hover:underline">
          Detay / düzenle
        </button>
        {error && <span className="text-xs font-medium text-brand-600">{error}</span>}
      </div>
    </li>
  );
}

export function ProposalsView({ rows }: { rows: ProposalRow[] }) {
  const [q, setQ] = useState("");
  const [month, setMonth] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [service, setService] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);

  const months = useMemo(() => [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort().reverse(), [rows]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    const list = rows.filter(
      (r) =>
        (!needle || r.companyName.toLocaleLowerCase("tr").includes(needle) || (r.contactName ?? "").toLocaleLowerCase("tr").includes(needle)) &&
        (!month || r.date.startsWith(month)) &&
        (!status || r.status === status) &&
        (!kind || r.kind === kind) &&
        (!service || r.services.includes(service))
    );
    // Bizden revize bekleyenler (teklif revizesi istendi) en üstte durur; kalanlar tarih sırasında.
    return [...list.filter((r) => r.status === "REVISION"), ...list.filter((r) => r.status !== "REVISION")];
  }, [rows, q, month, status, kind, service]);
  const filtering = !!(q || month || status || kind || service);

  const detail = rows.find((r) => r.id === detailId) ?? null;
  const upload = rows.find((r) => r.id === uploadId) ?? null;

  return (
    <div className="space-y-6">
      <Stats rows={rows} onMonth={(m) => setMonth((cur) => (cur === m ? "" : m))} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold">
            Verilen teklifler ve raporlar{" "}
            <span className="text-sm font-normal text-(--color-text-muted)">
              ({filtering ? `${filtered.length} / ${rows.length}` : rows.length})
            </span>
          </h2>
          {filtering && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setMonth("");
                setStatus("");
                setKind("");
                setService("");
              }}
              className="text-xs font-semibold text-brand-600 hover:underline"
            >
              Süzgeçleri temizle
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-48 flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--color-text-muted)" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Firma ya da kişi ara"
              className={`${selectCls} w-full pl-9`}
            />
          </div>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectCls} aria-label="Ay">
            <option value="">Tüm aylar</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={selectCls} aria-label="Tür">
            <option value="">Teklif ve rapor</option>
            {KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls} aria-label="Sonuç">
            <option value="">Tüm sonuçlar</option>
            {STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {STATUS_LABEL[s.key]}
              </option>
            ))}
          </select>
          <select value={service} onChange={(e) => setService(e.target.value)} className={selectCls} aria-label="Hizmet">
            <option value="">Tüm hizmetler</option>
            {SERVICES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <ul className="space-y-3">
          {filtered.map((r) => (
            <Row key={r.id} row={r} onOpen={() => setDetailId(r.id)} onUpload={() => setUploadId(r.id)} />
          ))}
        </ul>
        {filtered.length === 0 && (
          <p className="rounded-xl border border-dashed border-(--color-border) py-10 text-center text-sm text-(--color-text-muted)">
            {rows.length === 0 ? "Henüz teklif eklenmemiş. Yukarıdaki formdan ilk teklifi ekleyebilirsin." : "Bu süzgece uyan kayıt yok."}
          </p>
        )}
      </section>

      {detail && <ProposalDetailDialog key={detail.id} row={detail} onClose={() => setDetailId(null)} />}
      {upload && <UploadVersionDialog key={upload.id} row={upload} onClose={() => setUploadId(null)} />}
    </div>
  );
}
