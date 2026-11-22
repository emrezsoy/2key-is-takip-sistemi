"use client";

import { useRef, useState, useTransition } from "react";
import { Copy, FileText, Plus, Trash2, X } from "lucide-react";
import { createContentDoc, deleteContentDoc, updateContentDoc } from "@/lib/actions/content";
import { UploadBar } from "@/components/ui/UploadBar";
import { useUploader } from "@/lib/useUploader";
import { RichEditor } from "./RichEditor";

export type DocRow = {
  id: string;
  title: string;
  body: string;
  createdByName: string | null;
  updatedAt: string;
};

const EMPTY_DOC = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });

type Editing = { id: string | null; title: string; body: string } | null;

export function ContentDocs({
  clientId,
  year,
  month,
  docs,
  canEdit,
}: {
  clientId: string;
  year: number;
  month: number;
  docs: DocRow[];
  canEdit: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const getTextRef = useRef<(() => string) | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const up = useUploader();
  const [editing, setEditing] = useState<Editing>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [titleMissing, setTitleMissing] = useState(false);

  const open = (value: NonNullable<Editing>) => {
    setError(null);
    setTitleMissing(false);
    setCopied(false);
    setEditing(value);
    setEditorKey((k) => k + 1);
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();

  const save = () => {
    if (!editing) return;
    // Başlık yoksa kaydetmeden önce kullanıcıyı başlık alanına yönlendir.
    if (!editing.title.trim()) {
      setTitleMissing(true);
      titleRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      titleRef.current?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        if (editing.id) await updateContentDoc(editing.id, editing.title, editing.body);
        else await createContentDoc(clientId, year, month, editing.title, editing.body);
        close();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kaydedilemedi.");
      }
    });
  };

  const remove = () => {
    if (!editing?.id) return;
    if (!window.confirm("Bu metin silinsin mi?")) return;
    startTransition(async () => {
      try {
        await deleteContentDoc(editing.id!);
        close();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Silinemedi.");
      }
    });
  };

  return (
    <div className="space-y-3">
      {canEdit && (
        <button
          type="button"
          onClick={() => open({ id: null, title: "", body: EMPTY_DOC })}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus size={16} />
          Yeni metin
        </button>
      )}

      {docs.length === 0 && (
        <p className="rounded-xl border border-dashed border-(--color-border) p-8 text-center text-sm text-(--color-text-muted)">
          Bu ay için düz yazı içerik yok.
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {docs.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => open({ id: d.id, title: d.title, body: d.body })}
              className="flex w-full items-start gap-3 rounded-xl border border-(--color-border) bg-(--color-surface) p-4 text-left transition-colors hover:border-brand-500"
            >
              <FileText size={18} className="mt-0.5 shrink-0 text-brand-600" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{d.title}</span>
                <span className="block text-xs text-(--color-text-muted)">
                  {d.createdByName ?? "—"} · {new Date(d.updatedAt).toLocaleDateString("tr-TR")}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        onClose={() => setEditing(null)}
        className="m-auto w-[calc(100%-1.5rem)] max-w-3xl rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/50"
      >
        {editing && (
          <div className="flex max-h-[92dvh] flex-col">
            <div className="flex items-center gap-3 border-b border-(--color-border) px-5 py-3">
              {canEdit ? (
                <input
                  ref={titleRef}
                  value={editing.title}
                  onChange={(e) => {
                    setEditing({ ...editing, title: e.target.value });
                    if (e.target.value.trim()) setTitleMissing(false);
                  }}
                  placeholder="Metin başlığı"
                  maxLength={160}
                  aria-invalid={titleMissing}
                  className={`min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-base font-bold outline-none ${
                    titleMissing ? "ring-2 ring-red-500 placeholder:text-red-400" : ""
                  }`}
                />
              ) : (
                <h2 className="min-w-0 flex-1 truncate text-base font-bold">{editing.title}</h2>
              )}
              <button type="button" onClick={close} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>
            {titleMissing && (
              <p role="alert" className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-5 py-2 text-sm font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                <span aria-hidden>↑</span> Bu yazının bir başlığa ihtiyacı var. Lütfen yukarıdaki kutuya bir başlık yazın.
              </p>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <UploadBar progress={up.progress} label="Görsel yükleniyor" className="mb-3" />
              <RichEditor
                key={editorKey}
                initial={editing.body}
                editable={canEdit}
                onUploadImage={
                  canEdit
                    ? async (file) => {
                        const fd = new FormData();
                        fd.append("file", file);
                        return (await up.run<{ url: string }>("uploadContentImage", [clientId], fd)).url;
                      }
                    : undefined
                }
                onChange={(json) => setEditing((cur) => (cur ? { ...cur, body: json } : cur))}
                onReady={(getText) => {
                  getTextRef.current = getText;
                }}
              />
              {error && <p className="mt-2 text-xs text-brand-600">{error}</p>}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-(--color-border) p-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(getTextRef.current?.() ?? "");
                    setCopied(true);
                  }}
                  className="flex items-center gap-1 text-xs font-medium text-(--color-text-muted) hover:text-brand-600"
                >
                  <Copy size={13} />
                  {copied ? "Kopyalandı" : "Metni kopyala"}
                </button>
                {canEdit && editing.id && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={remove}
                    className="flex items-center gap-1 text-xs font-medium text-(--color-text-muted) hover:text-brand-600"
                  >
                    <Trash2 size={13} /> Sil
                  </button>
                )}
              </div>
              {canEdit && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={save}
                  className={`rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 ${
                    editing.title.trim() ? "" : "opacity-60"
                  }`}
                >
                  {pending ? "Kaydediliyor..." : "Kaydet"}
                </button>
              )}
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
