"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Download, ExternalLink, Trash2, X } from "lucide-react";
import { UploadBar } from "@/components/ui/UploadBar";
import { useUploader } from "@/lib/useUploader";
import { downloadHref } from "@/components/ui/MediaLightbox";
import { deleteProposal, setProposalStatus, updateProposal } from "@/lib/actions/proposals";
import { COMPANY_SIZES, KIND_LABEL, STATUSES } from "@/lib/proposals";
import { FilePick, ServicePicker, inputCls } from "./ProposalParts";
import { fmtDate, type ProposalRow } from "./types";

const FILE_TYPE_LABEL: Record<string, string> = { REPORT: "Rapor", PROPOSAL: "Teklif", REVISION: "Revize" };

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="mb-1 block text-xs font-semibold text-(--color-text-muted)">{children}</span>
);

const DIALOG_CLS =
  "m-auto w-[calc(100%-1.5rem)] max-w-xl rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/50";

function useDialogRef() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return ref;
}

/** Rapor için "teklif dosyası yükle" (teklife çevirir), teklif için "revize teklifi yükle". Hizmetler değiştirilebilir. */
export function UploadVersionDialog({ row, onClose }: { row: ProposalRow; onClose: () => void }) {
  const dialogRef = useDialogRef();
  const up = useUploader();
  const isReport = row.kind === "REPORT";
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState("");
  const [services, setServices] = useState<string[]>(row.services);
  const [custom, setCustom] = useState(row.customService ?? "");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (up.uploading) return;
    setError(null);
    if (!file) return setError("Dosyayı seçin ya da sürükleyip bırakın.");
    if (services.length === 0) return setError("En az bir hizmet seçin.");
    const fd = new FormData();
    fd.set("file", file);
    fd.set("date", date);
    services.forEach((s) => fd.append("services", s));
    fd.set("customService", custom);
    try {
      await up.run("addProposalFile", [row.id], fd);
      dialogRef.current?.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi.");
    }
  };

  return (
    <dialog ref={dialogRef} onClose={onClose} className={DIALOG_CLS}>
      <div className="p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">{isReport ? "Teklif dosyasını yükle" : "Revize teklifi yükle"}</h2>
            <p className="text-xs text-(--color-text-muted)">
              {row.companyName}
              {isReport ? " · rapor teklife çevrilir" : " · son iletilen teklif olarak en üstte durur"}
            </p>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Kapat">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <FilePick file={file} onFile={setFile} disabled={up.uploading} dropLabel="Dosyayı bırakın" />
          <label className="block">
            <Label>İletilme tarihi</Label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            <span className="mt-1 block text-[11px] text-(--color-text-muted)">Boş bırakırsan bugün yazılır.</span>
          </label>
          <div>
            <Label>Hizmetler (teklifte değiştiyse düzelt)</Label>
            <ServicePicker value={services} onChange={setServices} custom={custom} onCustomChange={setCustom} />
          </div>
        </div>

        <UploadBar progress={up.progress} label="Dosya Drive'a yükleniyor" className="mt-4" />
        {error && <p className="mt-3 text-sm font-medium text-brand-600">{error}</p>}
        <p className="mt-3 text-[11px] text-(--color-text-muted)">
          Yüklenince durum &quot;Sonuç bekleniyor&quot; olur ve hatırlatma bu tarihten yeniden sayılır.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-lg px-4 py-2 text-sm font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted)"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={up.uploading}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {up.uploading ? "Yükleniyor..." : "Yükle"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Detay: bilgileri düzelt, sonuç notu yaz, dosya sürümlerini gör / indir, sil. */
export function ProposalDetailDialog({ row, onClose }: { row: ProposalRow; onClose: () => void }) {
  const dialogRef = useDialogRef();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [f, setF] = useState({
    companyName: row.companyName,
    companySize: row.companySize,
    contactName: row.contactName ?? "",
    contactPhone: row.contactPhone ?? "",
    resultNote: row.resultNote ?? "",
    date: row.date,
  });
  const [services, setServices] = useState<string[]>(row.services);
  const [custom, setCustom] = useState(row.customService ?? "");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setF((p) => ({ ...p, [k]: e.target.value }));
  };

  const save = () =>
    start(async () => {
      setError(null);
      try {
        await updateProposal(row.id, { ...f, services, customService: custom });
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kaydedilemedi.");
      }
    });

  const remove = () =>
    start(async () => {
      try {
        await deleteProposal(row.id);
        dialogRef.current?.close();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Silinemedi.");
      }
    });

  const changeStatus = (status: string) =>
    start(async () => {
      setError(null);
      try {
        await setProposalStatus(row.id, status);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Durum değiştirilemedi.");
      }
    });

  return (
    <dialog ref={dialogRef} onClose={onClose} className={DIALOG_CLS}>
      <div className="flex max-h-[88dvh] flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-(--color-border) px-5 py-4">
          <div>
            <h2 className="text-base font-bold">{row.companyName}</h2>
            <p className="text-xs text-(--color-text-muted)">
              {KIND_LABEL[row.kind]} · {fmtDate(row.date)}
              {row.createdByName ? ` · ${row.createdByName} ekledi` : ""}
            </p>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Kapat">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <Label>Dosyalar (en üstteki son iletilen)</Label>
            <ul className="space-y-1.5">
              {row.files.map((file, i) => (
                <li key={file.id} className="flex items-center gap-2 rounded-lg border border-(--color-border) px-3 py-2 text-xs">
                  <span className="shrink-0 rounded bg-(--color-surface-muted) px-1.5 py-0.5 font-bold">
                    {FILE_TYPE_LABEL[file.type] ?? "Dosya"} {file.type === "REVISION" ? file.version - 1 : ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {file.name}
                    <span className="text-(--color-text-muted)"> · {fmtDate(file.date)}</span>
                  </span>
                  {i === 0 && <span className="shrink-0 font-semibold text-emerald-600">Son iletilen</span>}
                  <a href={file.url} target="_blank" rel="noreferrer" aria-label="Aç" className="shrink-0 text-brand-600 hover:underline">
                    <ExternalLink size={14} />
                  </a>
                  <a href={downloadHref(file.url)} download aria-label="İndir" className="shrink-0 text-brand-600 hover:underline">
                    <Download size={14} />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <label className="block">
            <Label>Sonuç</Label>
            <select
              value={row.status}
              disabled={pending}
              onChange={(e) => changeStatus(e.target.value)}
              className={inputCls}
            >
              {STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <Label>Sonuç notu (red nedeni, görüşme özeti...)</Label>
            <textarea value={f.resultNote} onChange={set("resultNote")} rows={3} maxLength={2000} className={inputCls} />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <Label>Firma adı</Label>
              <input type="text" value={f.companyName} onChange={set("companyName")} maxLength={150} className={inputCls} />
            </label>
            <label className="block">
              <Label>Firma büyüklüğü</Label>
              <select value={f.companySize} onChange={set("companySize")} className={inputCls}>
                {COMPANY_SIZES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <Label>İletişim kişisi</Label>
              <input type="text" value={f.contactName} onChange={set("contactName")} maxLength={120} className={inputCls} />
            </label>
            <label className="block">
              <Label>Telefon</Label>
              <input type="tel" value={f.contactPhone} onChange={set("contactPhone")} maxLength={30} className={inputCls} />
            </label>
            <label className="block">
              <Label>Tarih</Label>
              <input type="date" value={f.date} onChange={set("date")} className={inputCls} />
            </label>
          </div>

          <div>
            <Label>Hizmetler</Label>
            <ServicePicker
              value={services}
              onChange={(v) => {
                setSaved(false);
                setServices(v);
              }}
              custom={custom}
              onCustomChange={(v) => {
                setSaved(false);
                setCustom(v);
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-(--color-border) px-5 py-3">
          <div className="flex items-center gap-2 text-xs">
            {confirmDelete ? (
              <>
                <span className="text-(--color-text-muted)">Kayıt silinsin mi? (Drive&apos;daki dosyalar kalır)</span>
                <button type="button" onClick={remove} disabled={pending} className="font-semibold text-brand-600 hover:underline">
                  Evet, sil
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="text-(--color-text-muted) hover:underline">
                  Vazgeç
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 text-(--color-text-muted) hover:text-brand-600"
              >
                <Trash2 size={13} /> Sil
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {error && <span className="text-xs font-medium text-brand-600">{error}</span>}
            {saved && <span className="text-xs font-medium text-emerald-600">Kaydedildi</span>}
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
