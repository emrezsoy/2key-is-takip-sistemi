// Mesaj uygulamasının ortak küçük parçaları (sunucu ve istemci bileşenlerinde kullanılabilir).
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

const TZ = "Europe/Istanbul";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

/** WhatsApp gibi kısa zaman: bugün saat, dün "Dün", bu hafta gün adı, daha eski tarih. */
export function shortTime(v: Date | string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  const now = new Date();
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000));
  const k = dayKey(d);
  if (k === today) return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(d);
  if (k === yesterday) return "Dün";
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return new Intl.DateTimeFormat("tr-TR", { weekday: "long", timeZone: TZ }).format(d);
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: TZ }).format(d);
}

export function dayLabel(v: Date | string): string {
  const d = new Date(v);
  const now = new Date();
  const k = dayKey(d);
  if (k === dayKey(now)) return "Bugün";
  if (k === dayKey(new Date(now.getTime() - 86_400_000))) return "Dün";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric", timeZone: TZ }).format(d);
}
export { dayKey };

export const clockTime = (v: Date | string) => new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(v));

const AVATAR_COLORS = ["bg-rose-500", "bg-amber-500", "bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-fuchsia-500", "bg-teal-500", "bg-orange-500"];
const initials = (name: string) =>
  name
    .replace(/^@/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toLocaleUpperCase("tr-TR"))
    .join("") || "?";

export function Avatar({ name, src, channel, size = 48 }: { name: string; src?: string | null; channel?: "INSTAGRAM" | "FACEBOOK"; size?: number }) {
  const color = AVATAR_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- Meta CDN profil fotoğrafı
        <img src={src} alt="" className="h-full w-full rounded-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className={`flex h-full w-full items-center justify-center rounded-full font-bold text-white ${color}`} style={{ fontSize: size * 0.38 }}>
          {initials(name)}
        </span>
      )}
      {channel && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-(--color-bg) text-[8px] font-extrabold text-white ${
            channel === "INSTAGRAM" ? "bg-gradient-to-br from-fuchsia-500 via-rose-500 to-amber-400" : "bg-blue-600"
          }`}
          title={channel === "INSTAGRAM" ? "Instagram" : "Facebook"}
        >
          {channel === "INSTAGRAM" ? "IG" : "f"}
        </span>
      )}
    </span>
  );
}

/** Büyük başlıklı sayfa üstü (WhatsApp sekme başlıkları gibi). */
export function DmPageHeader({ title, back, right, children }: { title: string; back?: string; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 bg-(--color-bg)/95 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
      <div className="flex min-h-9 items-center gap-2">
        {back && (
          <Link href={back} className="-ml-2 flex items-center rounded-full p-1 text-brand-500" aria-label="Geri">
            <ChevronLeft size={26} />
          </Link>
        )}
        <div className="ml-auto flex items-center gap-2">{right}</div>
      </div>
      <h1 className="mt-1 text-[1.9rem] font-extrabold leading-tight tracking-tight">{title}</h1>
      {children}
    </header>
  );
}

export const dmCard = "rounded-2xl border border-(--color-border) bg-(--color-surface)";
