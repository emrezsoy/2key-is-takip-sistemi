"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Film, Trash2 } from "lucide-react";
import { deleteRequestFiles } from "@/lib/actions/fileRemoval";

const isVideo = (name: string) => /\.(mp4|mov|webm|m4v)$/i.test(name);

/** Talebin referans görsel / videoları. `canRemove` ise her dosyada silme düğmesi çıkar
 * (müşteri için sadece talep henüz işe alınmadıysa; yetki sunucuda da kontrol edilir). */
export function RequestFilesGrid({
  requestId,
  files,
  canRemove,
}: {
  requestId: string;
  files: { id: string; url: string; name: string }[];
  canRemove: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (files.length === 0) return null;

  const remove = (f: { id: string; name: string }) => {
    if (!window.confirm(`"${f.name}" silinsin mi?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteRequestFiles(requestId, [f.id]);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Dosya silinemedi.");
      }
    });
  };

  return (
    <div className="space-y-1">
      <ul className="flex flex-wrap gap-2">
        {files.map((f) => (
          <li key={f.id} className="relative h-16 w-16 overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface-muted)">
            <a href={f.url} target="_blank" rel="noreferrer" title={f.name} className="block h-full w-full">
              {isVideo(f.name) ? (
                <video src={`${f.url}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.url} alt={f.name} loading="lazy" className="h-full w-full object-cover" />
              )}
            </a>
            {isVideo(f.name) && (
              <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/60 p-0.5 text-white">
                <Film size={10} />
              </span>
            )}
            {canRemove && (
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(f)}
                aria-label={`${f.name} dosyasını sil`}
                title="Bu dosyayı sil"
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-brand-600 disabled:opacity-50"
              >
                <Trash2 size={10} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-[11px] text-brand-600">{error}</p>}
    </div>
  );
}
