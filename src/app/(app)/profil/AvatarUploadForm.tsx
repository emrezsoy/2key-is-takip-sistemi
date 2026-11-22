"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { percentOf, useUploader } from "@/lib/useUploader";
import { FileDropZone } from "@/components/ui/FileDropZone";

export function AvatarUploadForm({
  fullName,
  avatarUrl,
}: {
  fullName: string;
  avatarUrl: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const up = useUploader();
  const [error, setError] = useState<string | null>(null);

  const upload = (file: File) => {
    setPreview(URL.createObjectURL(file));
    setError(null);

    const formData = new FormData();
    formData.set("avatar", file);
    up.run("updateAvatar", [], formData).catch((err) => {
      setError(err instanceof Error ? err.message : "Yükleme başarısız.");
      setPreview(avatarUrl);
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
  };

  // Sürüklenen ilk görsel profil fotoğrafı olur.
  const handleDrop = (files: File[]) => {
    const img = files.find((f) => f.type.startsWith("image/"));
    if (!img) {
      setError("Sadece görsel dosyası bırakabilirsin.");
      return;
    }
    upload(img);
  };

  return (
    <FileDropZone onFiles={handleDrop} className="rounded-full" label="Bırak">
    <div className="relative">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-brand-600 text-lg font-semibold text-white"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={fullName} className="h-full w-full object-cover" />
        ) : (
          fullName.charAt(0).toUpperCase()
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <Camera size={18} className="text-white" />
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleChange}
      />
      {up.progress && (
        <p className="absolute -bottom-5 left-0 whitespace-nowrap text-[11px] font-semibold text-brand-600">
          {up.progress.phase === "processing" ? "Kaydediliyor..." : `Yükleniyor %${percentOf(up.progress)}`}
        </p>
      )}
      {error && (
        <p className="absolute -bottom-5 left-0 whitespace-nowrap text-[11px] text-brand-600">
          {error}
        </p>
      )}
    </div>
    </FileDropZone>
  );
}
