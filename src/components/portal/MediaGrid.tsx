import { Film } from "lucide-react";

const isVideo = (name: string) => /\.(mp4|mov|webm|m4v)$/i.test(name);

/** Referans görsel / video küçük resimleri (tıklayınca tam boyut açılır). */
export function MediaGrid({ files }: { files: { url: string; name: string }[] }) {
  if (files.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.url} className="relative h-16 w-16 overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface-muted)">
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
        </li>
      ))}
    </ul>
  );
}
