"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { UploadAction } from "@/lib/uploadActions";

export type UploadProgress = {
  loaded: number;
  total: number;
  /** upload = dosya sunucuya gidiyor; processing = sunucuya ulaştı, Drive'a aktarılıyor / kaydediliyor. */
  phase: "upload" | "processing";
};

export const percentOf = (p: UploadProgress | null) =>
  p && p.total > 0 ? Math.min(100, Math.floor((p.loaded / p.total) * 100)) : 0;

/** Formu `/api/upload/<işlem>` adresine yollar ve yükleme ilerlemesini bildirir (sunucu eylemleri ilerleme vermediği için XHR). */
export function uploadWithProgress<T = unknown>(
  action: UploadAction,
  args: unknown[],
  formData: FormData,
  onProgress?: (p: UploadProgress) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const body = new FormData();
    body.append("__args", JSON.stringify(args));
    for (const [key, value] of formData.entries()) body.append(key, value);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/upload/${action}`);
    xhr.responseType = "text";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.({ loaded: e.loaded, total: e.total, phase: "upload" });
    };
    xhr.upload.onload = () => onProgress?.({ loaded: 1, total: 1, phase: "processing" });
    xhr.onerror = () => reject(new Error("Bağlantı koptu, yükleme tamamlanamadı. İnternetini kontrol edip tekrar dene."));
    xhr.onabort = () => reject(new Error("Yükleme iptal edildi."));
    xhr.onload = () => {
      let json: { ok?: boolean; data?: T; error?: string } | null = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        json = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && json?.ok) resolve((json.data ?? null) as T);
      else if (json?.error) reject(new Error(json.error));
      else if (xhr.status === 413) reject(new Error("Dosya sunucunun kabul ettiği boyutu aşıyor."));
      else reject(new Error(`Sunucu yanıt vermedi (${xhr.status}). Lütfen tekrar dene.`));
    };
    xhr.send(body);
  });
}

/** Yükleme durumu tutan kanca: `run` yüklemeyi yapar, `progress` çubuğa verilir. Bitince sayfa verisi yenilenir. */
export function useUploader() {
  const router = useRouter();
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const busy = useRef(false);

  const run = useCallback(
    async <T = unknown>(action: UploadAction, args: unknown[], formData: FormData): Promise<T> => {
      busy.current = true;
      setProgress({ loaded: 0, total: 0, phase: "upload" });
      try {
        const data = await uploadWithProgress<T>(action, args, formData, setProgress);
        router.refresh();
        return data;
      } finally {
        busy.current = false;
        setProgress(null);
      }
    },
    [router]
  );

  return { progress, uploading: progress !== null, run };
}
