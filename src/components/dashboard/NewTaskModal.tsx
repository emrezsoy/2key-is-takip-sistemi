"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { UploadBar } from "@/components/ui/UploadBar";
import { useUploader } from "@/lib/useUploader";
import { ReferenceFilesField } from "@/components/board/ReferenceFilesField";

type Option = { id: string; label: string };

export function NewTaskModal({
  clients,
  employees,
  canSetUrgency,
  canSetDifficulty,
}: {
  clients: Option[];
  employees: Option[];
  canSetUrgency: boolean;
  canSetDifficulty: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const up = useUploader();

  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        <Plus size={16} />
        Yeni Görev
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-lg rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/50"
      >
        <form
          ref={formRef}
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              try {
                await up.run("createTask", [], formData);
                formRef.current?.reset();
                close();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Bir hata oluştu.");
              }
            });
          }}
          className="p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Yeni Görev</h2>
            <button type="button" onClick={close} aria-label="Kapat">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                Açıklama
              </label>
              <input
                name="title"
                required
                placeholder="Görev başlığı"
                className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
              <textarea
                name="description"
                placeholder="Detay (opsiyonel)"
                rows={2}
                className="mt-2 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                  Müşteri
                </label>
                <select
                  name="clientId"
                  className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
                >
                  <option value="">Seçiniz</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                  Atanan kişi
                </label>
                <select
                  name="assignedToId"
                  required
                  className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
                >
                  <option value="">Seçiniz</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                  Süre
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    name="durationValue"
                    required
                    defaultValue={1}
                    className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
                  />
                  <select
                    name="durationUnit"
                    className="rounded-lg border border-(--color-border) bg-(--color-bg) px-2 py-2 text-sm"
                  >
                    <option value="DAY">gün</option>
                    <option value="HOUR">saat</option>
                  </select>
                </div>
              </div>

              {canSetUrgency && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                    Aciliyet
                  </label>
                  <select
                    name="urgency"
                    defaultValue="MEDIUM"
                    className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
                  >
                    <option value="LOW">Düşük</option>
                    <option value="MEDIUM">Orta</option>
                    <option value="HIGH">Yüksek</option>
                    <option value="URGENT">Acil</option>
                  </select>
                </div>
              )}
            </div>

            {canSetDifficulty && (
              <div>
                <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                  Zorluk seviyesi (1-5, çalışan görmez)
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  name="difficulty"
                  className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
                />
              </div>
            )}

            <UploadBar progress={up.progress} label="Dosyalar yükleniyor" />
            <ReferenceFilesField
              label="Referans dosyaları / kullanılacak görseller (opsiyonel)"
              hint="Birden fazla görsel veya dosya ekleyebilirsin. İşi alan kişi görür; paylaşım takvimine gitmez."
            />
          </div>

          {error && <p className="mt-3 text-xs text-brand-600">{error}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-lg px-4 py-2 text-sm font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted)"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Ekleniyor..." : "Görevi Ekle"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
