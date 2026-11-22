"use client";

import { useState } from "react";
import { FilePlus2 } from "lucide-react";
import { UploadBar } from "@/components/ui/UploadBar";
import { useUploader } from "@/lib/useUploader";
import { COMPANY_SIZES, KINDS } from "@/lib/proposals";
import { FilePick, ServicePicker, inputCls } from "./ProposalParts";

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="mb-1 block text-xs font-semibold text-(--color-text-muted)">{children}</span>
);

/** Yeni teklif / rapor ekleme formu (sayfanın en üstünde). */
export function ProposalForm() {
  const up = useUploader();
  const [companyName, setCompanyName] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [kind, setKind] = useState("PROPOSAL");
  const [services, setServices] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [date, setDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const reset = () => {
    setCompanyName("");
    setCompanySize("");
    setKind("PROPOSAL");
    setServices([]);
    setCustom("");
    setContactName("");
    setContactPhone("");
    setDate("");
    setFile(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (up.uploading) return;
    setError(null);
    setDone(null);
    if (!companyName.trim()) return setError("Firma adı zorunlu.");
    if (!companySize) return setError("Firma büyüklüğünü seçin.");
    if (services.length === 0) return setError("En az bir hizmet seçin.");
    if (!file) return setError("Teklif dosyasını seçin ya da sürükleyip bırakın.");

    const fd = new FormData();
    fd.set("companyName", companyName);
    fd.set("companySize", companySize);
    fd.set("kind", kind);
    services.forEach((s) => fd.append("services", s));
    fd.set("customService", custom);
    fd.set("contactName", contactName);
    fd.set("contactPhone", contactPhone);
    fd.set("date", date);
    fd.set("file", file);
    try {
      await up.run("createProposal", [], fd);
      setDone(`${companyName.trim()} kaydedildi.`);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kaydedilemedi.");
    }
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4 sm:p-5">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold">
        <FilePlus2 size={18} className="text-brand-600" />
        Yeni teklif ekle
      </h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <Label>Firma adı</Label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            maxLength={150}
            placeholder="Örn. Ekohesap"
            className={inputCls}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Label>Firma büyüklüğü</Label>
            <select value={companySize} onChange={(e) => setCompanySize(e.target.value)} className={inputCls}>
              <option value="">Seçin</option>
              {COMPANY_SIZES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <Label>Verilen</Label>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
              {KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <Label>İletişim kişisi (ad soyad)</Label>
          <input
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            maxLength={120}
            placeholder="Telefon numarasının sahibi"
            className={inputCls}
          />
        </label>
        <label className="block">
          <Label>İletişim telefonu</Label>
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            maxLength={30}
            placeholder="05xx xxx xx xx"
            className={inputCls}
          />
        </label>
      </div>

      <div className="mt-4">
        <Label>Verilen hizmetler (birkaçını seçebilirsin)</Label>
        <ServicePicker value={services} onChange={setServices} custom={custom} onCustomChange={setCustom} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1fr_14rem]">
        <div>
          <Label>{kind === "REPORT" ? "Rapor dosyası" : "Teklif dosyası"}</Label>
          <FilePick file={file} onFile={setFile} disabled={up.uploading} />
        </div>
        <label className="block">
          <Label>{kind === "REPORT" ? "Rapor tarihi" : "Teklif tarihi"}</Label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          <span className="mt-1 block text-[11px] text-(--color-text-muted)">
            Boş bırakırsan yükleme günü (bugün) yazılır; farklı bir tarih seçebilirsin.
          </span>
        </label>
      </div>

      <UploadBar progress={up.progress} label="Dosya Drive'a yükleniyor" className="mt-4" />
      {error && <p className="mt-3 text-sm font-medium text-brand-600">{error}</p>}
      {done && <p className="mt-3 text-sm font-medium text-emerald-600">{done}</p>}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={up.uploading}
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {up.uploading ? "Kaydediliyor..." : kind === "REPORT" ? "Raporu kaydet" : "Teklifi kaydet"}
        </button>
      </div>
    </form>
  );
}
