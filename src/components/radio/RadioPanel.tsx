"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { Copy, Pause, Play, Plus, RefreshCw, SkipForward, Trash2, Tv, Volume2, X } from "lucide-react";
import {
  addRadioTrack,
  regenerateRadioLink,
  removeRadioTrack,
  setRadioPaused,
  setRadioVolume,
  skipRadioTrack,
  type RadioResult,
} from "@/lib/actions/radio";

export type RadioTrackView = {
  id: string;
  videoId: string;
  title: string;
  channel: string | null;
  addedById: string;
  addedByName: string;
  status: "QUEUED" | "PLAYING" | "PLAYED" | "SKIPPED" | "FAILED";
};

const thumb = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

const HISTORY_LABEL: Record<string, { text: string; cls: string }> = {
  PLAYED: { text: "Çalındı", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  SKIPPED: { text: "Geçildi", cls: "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300" },
  FAILED: { text: "Oynatılamadı", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
};

const noopSubscribe = () => () => {};

const card = "rounded-xl border border-(--color-border) bg-(--color-surface)";

export function RadioPanel({
  me,
  current,
  queue,
  history,
  skipVotes,
  iVoted,
  controls,
  tvToken,
  limits,
}: {
  me: { id: string; isAdmin: boolean };
  current: RadioTrackView | null;
  queue: RadioTrackView[];
  history: RadioTrackView[];
  skipVotes: number;
  iVoted: boolean;
  controls: { paused: boolean; volume: number; tvOnline: boolean };
  tvToken: string | null;
  limits: { perUser: number; skipVotes: number };
}) {
  const [link, setLink] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  // Sürüklerken yerel değer, bırakınca sunucudaki değer gösterilir (başka yönetici değiştirirse o görünür).
  const [dragVolume, setDragVolume] = useState<number | null>(null);
  const volume = dragVolume ?? controls.volume;
  const myQueued = queue.filter((t) => t.addedById === me.id).length;

  function run(fn: () => Promise<RadioResult>, onOk?: () => void) {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        onOk?.();
        setNotice(r.message ? { ok: true, text: r.message } : null);
      } else setNotice({ ok: false, text: r.error });
    });
  }

  const canControl = (t: RadioTrackView) => me.isAdmin || t.addedById === me.id;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Ofis Radyosu</h1>
          <p className="text-sm text-(--color-text-muted)">YouTube linkini yapıştır, sıraya girsin; ofisteki TV sırayla çalar.</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            controls.tvOnline
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              : "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300"
          }`}
        >
          <Tv size={14} />
          {controls.tvOnline ? (controls.paused ? "TV bağlı · duraklatıldı" : "TV bağlı") : "TV bağlı değil"}
        </span>
      </div>

      {/* Şarkı ekleme */}
      <form
        className={`${card} p-4`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!link.trim()) return;
          run(() => addRadioTrack(link), () => setLink(""));
        }}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            inputMode="url"
            className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <button
            type="submit"
            disabled={pending || !link.trim() || myQueued >= limits.perUser}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            <Plus size={16} />
            Sıraya ekle
          </button>
        </div>
        <p className="mt-2 text-xs text-(--color-text-muted)">
          Sırada en fazla {limits.perUser} şarkın olabilir ({myQueued}/{limits.perUser}). Çalan şarkıyı {limits.skipVotes} kişi
          &quot;Geç&quot; derse atlanır.
        </p>
        {notice && (
          <div
            className={`mt-3 flex items-start justify-between gap-2 rounded-lg px-3 py-2 text-sm ${
              notice.ok
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
                : "bg-brand-50 text-brand-800 dark:bg-brand-900/20 dark:text-brand-300"
            }`}
          >
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Kapat" className="opacity-70 hover:opacity-100">
              <X size={16} />
            </button>
          </div>
        )}
      </form>

      {/* Şimdi çalıyor */}
      <section className={`${card} overflow-hidden`}>
        <div className="border-b border-(--color-border) px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-(--color-text-muted)">
          Şimdi çalıyor
        </div>
        {current ? (
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb(current.videoId)} alt="" className="aspect-video w-full rounded-lg object-cover sm:w-48" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-snug">{current.title}</p>
              {current.channel && <p className="text-sm text-(--color-text-muted)">{current.channel}</p>}
              <p className="mt-1 text-sm">
                Gönderen: <span className="font-medium">{current.addedByName}</span>
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-stretch gap-2">
              {canControl(current) ? (
                <button
                  disabled={pending}
                  onClick={() => run(() => skipRadioTrack(current.id))}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-2 text-sm font-semibold hover:bg-(--color-surface-muted) disabled:opacity-60"
                >
                  <SkipForward size={16} />
                  Geç
                </button>
              ) : (
                <button
                  disabled={pending || iVoted}
                  onClick={() => run(() => skipRadioTrack(current.id))}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-2 text-sm font-semibold hover:bg-(--color-surface-muted) disabled:opacity-60"
                >
                  <SkipForward size={16} />
                  {iVoted ? "Oy verdin" : "Geç"} ({skipVotes}/{limits.skipVotes})
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="p-6 text-center text-sm text-(--color-text-muted)">Şu an çalan bir şarkı yok. İlk şarkıyı sen ekle!</p>
        )}

        {me.isAdmin && (
          <div className="flex flex-wrap items-center gap-4 border-t border-(--color-border) bg-(--color-surface-muted) px-4 py-3">
            <button
              disabled={pending}
              onClick={() => run(() => setRadioPaused(!controls.paused))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {controls.paused ? <Play size={16} /> : <Pause size={16} />}
              {controls.paused ? "Devam ettir" : "Duraklat"}
            </button>
            <label className="flex min-w-48 flex-1 items-center gap-2 text-sm">
              <Volume2 size={16} className="shrink-0 text-(--color-text-muted)" />
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={volume}
                onChange={(e) => setDragVolume(Number(e.target.value))}
                onPointerUp={() => run(() => setRadioVolume(volume), () => setDragVolume(null))}
                onKeyUp={() => run(() => setRadioVolume(volume), () => setDragVolume(null))}
                className="w-full accent-brand-600"
                aria-label="TV ses seviyesi"
              />
              <span className="w-10 text-right tabular-nums">{volume}</span>
            </label>
          </div>
        )}
      </section>

      {/* Sıra */}
      <section className={card}>
        <div className="border-b border-(--color-border) px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-(--color-text-muted)">
          Sıradakiler ({queue.length})
        </div>
        {queue.length === 0 ? (
          <p className="p-6 text-center text-sm text-(--color-text-muted)">Sıra boş.</p>
        ) : (
          <ol className="divide-y divide-(--color-border)">
            {queue.map((t, i) => (
              <li key={t.id} className={`flex items-center gap-3 px-4 py-2.5 ${t.addedById === me.id ? "bg-brand-50/50 dark:bg-brand-900/10" : ""}`}>
                <span className="w-5 shrink-0 text-center text-sm font-semibold text-(--color-text-muted)">{i + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumb(t.videoId)} alt="" className="aspect-video w-20 shrink-0 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="truncate text-xs text-(--color-text-muted)">{t.addedByName}</p>
                </div>
                {canControl(t) && (
                  <button
                    disabled={pending}
                    onClick={() => run(() => removeRadioTrack(t.id))}
                    aria-label="Sıradan kaldır"
                    title="Sıradan kaldır"
                    className="rounded-md p-1.5 text-(--color-text-muted) hover:bg-(--color-surface-muted) hover:text-brand-600 disabled:opacity-60"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Son çalınanlar */}
      {history.length > 0 && (
        <section className={card}>
          <div className="border-b border-(--color-border) px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-(--color-text-muted)">
            Son çalınanlar
          </div>
          <ul className="divide-y divide-(--color-border)">
            {history.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{t.title}</p>
                  <p className="truncate text-xs text-(--color-text-muted)">{t.addedByName}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${HISTORY_LABEL[t.status]?.cls ?? ""}`}>
                  {HISTORY_LABEL[t.status]?.text}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {me.isAdmin && <TvLinkBox token={tvToken} pending={pending} onRegenerate={() => run(() => regenerateRadioLink())} />}
    </div>
  );
}

function TvLinkBox({ token, pending, onRegenerate }: { token: string | null; pending: boolean; onRegenerate: () => void }) {
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const url = token && origin ? `${origin}/radyo-tv/${token}` : "";

  return (
    <section className={`${card} p-4`}>
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Tv size={16} /> TV bağlantısı <span className="font-normal text-(--color-text-muted)">(sadece yöneticiler görür)</span>
      </h2>
      {token ? (
        <>
          <p className="mt-1 text-xs text-(--color-text-muted)">
            Mi Stick&apos;teki tarayıcıda bu adresi açın ve &quot;Radyoyu Başlat&quot;a basın. Giriş gerekmez; bağlantıyı kimseyle paylaşmayın.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 font-mono text-xs outline-none"
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(url).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-2 text-sm font-semibold hover:bg-(--color-surface-muted)"
            >
              <Copy size={15} /> {copied ? "Kopyalandı" : "Kopyala"}
            </button>
          </div>
        </>
      ) : (
        <p className="mt-1 text-xs text-(--color-text-muted)">Henüz TV bağlantısı yok. Oluşturup Mi Stick&apos;teki tarayıcıda açın.</p>
      )}
      <div className="mt-3">
        {token && confirming ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Eski bağlantı çalışmayı bırakır, TV&apos;de yenisini açmanız gerekir.</span>
            <button
              disabled={pending}
              onClick={() => {
                setConfirming(false);
                onRegenerate();
              }}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              Yenile
            </button>
            <button onClick={() => setConfirming(false)} className="rounded-lg px-3 py-1.5 text-sm hover:bg-(--color-surface-muted)">
              Vazgeç
            </button>
          </div>
        ) : (
          <button
            disabled={pending}
            onClick={() => (token ? setConfirming(true) : onRegenerate())}
            className="inline-flex items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-1.5 text-sm font-semibold hover:bg-(--color-surface-muted) disabled:opacity-60"
          >
            <RefreshCw size={15} /> {token ? "Yeni bağlantı oluştur" : "TV bağlantısı oluştur"}
          </button>
        )}
      </div>
    </section>
  );
}
