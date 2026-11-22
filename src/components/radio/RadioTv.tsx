"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// TV ekranı: sunucudan durumu 3 sn'de bir çeker, YouTube oynatıcısında çalan şarkıyı açar,
// şarkı bitince / oynatılamayınca sunucuya bildirir. Tarayıcılar sesli otomatik oynatmaya ancak
// bir kullanıcı hareketinden sonra izin verdiği için ilk açılışta kumandayla "Radyoyu Başlat"a basılır.

type Track = { id: string; videoId: string; title: string; channel: string | null; addedByName: string };
type TvState = { paused: boolean; volume: number; current: Track | null; queue: Track[]; queueCount: number };

/* Minimal YouTube IFrame API tipleri */
type YTPlayer = {
  loadVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  setVolume(v: number): void;
  unMute(): void;
  mute(): void;
  getPlayerState(): number;
  destroy(): void;
};
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      width?: string;
      height?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    }
  ) => YTPlayer;
};
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;
const YT_ENDED = 0;
const POLL_MS = 3000;
/** Bu süre içinde çalmaya başlamayan şarkı "oynatılamadı" sayılıp geçilir. */
const STUCK_MS = 30_000;

function loadYouTubeApi(): Promise<YTNamespace> {
  return new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
}

/** autoStart: Mi Stick'teki Ofis Radyosu uygulaması (?oto=1) sesli otomatik oynatmaya izin verdiği için "Başlat" beklenmez. */
export function RadioTv({ token, autoStart = false }: { token: string; autoStart?: boolean }) {
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<TvState | null>(null);
  const [offline, setOffline] = useState(false);
  const [invalid, setInvalid] = useState(false);
  // Tarayıcı sesli otomatik oynatmayı engellerse şarkı sessiz başlatılır ve kumandayla sesi açma düğmesi gösterilir.
  const [needsSound, setNeedsSound] = useState(false);
  const host = useSyncExternalStore(
    () => () => {},
    () => window.location.host,
    () => ""
  );

  const playerEl = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const loadedId = useRef<string | null>(null); // TV'de açık olan şarkının (RadioTrack) id'si
  const loadedAt = useRef(0);
  const reported = useRef<string | null>(null);
  const everPlayed = useRef(false);
  const playAttempts = useRef(0);
  const stateRef = useRef<TvState | null>(null);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);


  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/radio/tv/${token}`, { cache: "no-store" });
      if (res.status === 403) {
        setInvalid(true);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setState((await res.json()) as TvState);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [token]);

  const report = useCallback(
    async (trackId: string, event: "ended" | "error", code?: number) => {
      if (reported.current === trackId) return;
      reported.current = trackId;
      try {
        await fetch(`/api/radio/tv/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackId, event, code }),
        });
      } catch {
        reported.current = null; // bağlantı yoksa sonra tekrar denenir
      }
      poll();
    },
    [token, poll]
  );

  // Durumu düzenli çek (başlatmadan önce de: ekranda sıra görünsün, panel TV'yi bağlı görsün).
  useEffect(() => {
    const first = setTimeout(poll, 0);
    const id = setInterval(poll, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [poll]);

  async function startRadio() {
    setStarted(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
    try {
      await (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<unknown> } }).wakeLock?.request("screen");
    } catch {
      /* desteklenmiyorsa önemli değil */
    }
    const YT = await loadYouTubeApi();
    if (!playerEl.current || player.current) return;
    // YouTube verilen öğeyi iframe ile değiştirir; React'in yönettiği öğeye dokunmasın diye içine ayrı bir öğe açılır.
    const mount = document.createElement("div");
    playerEl.current.appendChild(mount);
    player.current = new YT.Player(mount, {
      width: "100%",
      height: "100%",
      playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, fs: 0, disablekb: 1 },
      events: {
        onReady: () => {
          player.current?.unMute();
          setReady(true);
        },
        onStateChange: (e) => {
          if (e.data === YT_PLAYING) everPlayed.current = true;
          if (e.data === YT_ENDED && loadedId.current) report(loadedId.current, "ended");
        },
        onError: (e) => {
          if (loadedId.current) report(loadedId.current, "error", e.data);
        },
      },
    });
  }

  useEffect(() => {
    if (!autoStart) return;
    const t = setTimeout(() => startRadio(), 0);
    return () => clearTimeout(t);
    // startRadio sadece ilk açılışta bir kez çağrılır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // Sunucudaki duruma göre oynatıcıyı yönet.
  useEffect(() => {
    const p = player.current;
    if (!ready || !p || !state) return;
    const cur = state.current;
    if ((cur?.id ?? null) !== loadedId.current) {
      loadedId.current = cur?.id ?? null;
      loadedAt.current = Date.now();
      everPlayed.current = false;
      playAttempts.current = 0;
      if (cur) p.loadVideoById(cur.videoId);
      else p.stopVideo();
    }
    p.setVolume(state.volume);
    if (cur) {
      const s = p.getPlayerState();
      if (state.paused && (s === YT_PLAYING || s === YT_BUFFERING)) p.pauseVideo();
      else if (!state.paused && s === YT_PAUSED) p.playVideo();
    }
  }, [ready, state]);

  // Başlamayan şarkı: önce tekrar "oynat", olmazsa sessiz başlat (sesi kumandayla açılır), hâlâ olmazsa geç.
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const s = stateRef.current;
      const p = player.current;
      if (!p || !s?.current || s.paused || !loadedId.current || everPlayed.current) return;
      const elapsed = Date.now() - loadedAt.current;
      if (elapsed > STUCK_MS) report(loadedId.current, "error", -1);
      else if (elapsed > 8000 && playAttempts.current === 1) {
        playAttempts.current = 2;
        p.mute();
        p.playVideo();
        setNeedsSound(true);
      } else if (elapsed > 4000 && playAttempts.current === 0) {
        playAttempts.current = 1;
        p.playVideo();
      }
    }, 2000);
    return () => clearInterval(id);
  }, [ready, report]);

  function enableSound() {
    player.current?.unMute();
    player.current?.playVideo();
    setNeedsSound(false);
  }

  if (invalid) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black p-10 text-center text-2xl text-white">
        Bu TV bağlantısı artık geçerli değil. Sistemdeki Ofis Radyosu sayfasından yeni bağlantıyı açın.
      </div>
    );
  }

  const cur = state?.current ?? null;

  return (
    <div className="fixed inset-0 flex gap-[2vw] overflow-hidden bg-[#0b0b0d] px-[2.5vw] py-[3vh] text-white">
      {/* Oynatıcı */}
      <div className="relative flex min-w-0 flex-1 items-center justify-center">
        <div className="relative aspect-video w-full overflow-hidden rounded-[1vw] bg-black shadow-2xl">
          <div ref={playerEl} className="absolute inset-0 h-full w-full" />
          {(!started || !cur) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-[3vh] bg-[#0b0b0d] p-[3vw] text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo.png" alt="2 Key idea" className="h-[9vh] w-auto" />
              <p className="text-[2.6vw] font-bold">Ofis Radyosu</p>
              {!started ? (
                <button
                  autoFocus
                  onClick={startRadio}
                  className="rounded-full bg-[#f01c26] px-[3vw] py-[2vh] text-[2vw] font-bold text-white outline-none ring-white/80 focus:ring-[0.4vw]"
                >
                  ▶ Radyoyu Başlat
                </button>
              ) : (
                <p className="text-[1.6vw] text-white/70">
                  Sıra boş. Şarkı eklemek için: <span className="font-semibold text-white">{host}/radyo</span>
                </p>
              )}
            </div>
          )}
          {started && cur && needsSound && (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/90 to-transparent p-[3vh]">
              <button
                autoFocus
                onClick={enableSound}
                className="rounded-full bg-[#f01c26] px-[2.5vw] py-[1.5vh] text-[1.6vw] font-bold text-white outline-none ring-white/80 focus:ring-[0.4vw]"
              >
                🔊 Sesi açmak için kumandada Tamam&apos;a basın
              </button>
            </div>
          )}
          {started && cur && state?.paused && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[2.4vw] font-bold">⏸ Duraklatıldı</div>
          )}
        </div>
      </div>

      {/* Yan panel */}
      <aside className="flex w-[28vw] shrink-0 flex-col gap-[2.5vh]">
        <div className="rounded-[1vw] bg-white/5 p-[1.5vw]">
          <p className="text-[0.9vw] font-semibold uppercase tracking-widest text-[#ff646b]">Şimdi çalıyor</p>
          {cur ? (
            <>
              <p className="mt-[1vh] line-clamp-3 text-[1.6vw] font-bold leading-tight">{cur.title}</p>
              {cur.channel && <p className="mt-[0.5vh] truncate text-[1.05vw] text-white/60">{cur.channel}</p>}
              <p className="mt-[1.5vh] text-[1.15vw]">
                🎧 Gönderen: <span className="font-semibold">{cur.addedByName}</span>
              </p>
            </>
          ) : (
            <p className="mt-[1vh] text-[1.3vw] text-white/60">—</p>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col rounded-[1vw] bg-white/5 p-[1.5vw]">
          <p className="text-[0.9vw] font-semibold uppercase tracking-widest text-white/50">
            Sıradakiler {state && state.queueCount > 0 ? `(${state.queueCount})` : ""}
          </p>
          {state && state.queue.length > 0 ? (
            <ol className="mt-[1.2vh] space-y-[1.4vh] overflow-hidden">
              {state.queue.map((t, i) => (
                <li key={t.id} className="flex items-center gap-[0.8vw]">
                  <span className="w-[1.4vw] shrink-0 text-center text-[1.1vw] font-bold text-white/40">{i + 1}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://i.ytimg.com/vi/${t.videoId}/mqdefault.jpg`} alt="" className="aspect-video w-[5.5vw] shrink-0 rounded object-cover" />
                  <div className="min-w-0">
                    <p className="truncate text-[1.05vw] font-medium">{t.title}</p>
                    <p className="truncate text-[0.9vw] text-white/50">{t.addedByName}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-[1.2vh] text-[1.1vw] text-white/50">Sırada şarkı yok.</p>
          )}
        </div>

        <div className="rounded-[1vw] bg-[#f01c26]/15 p-[1.2vw] text-[1vw] leading-snug">
          Şarkı eklemek için sisteme gir:
          <br />
          <span className="text-[1.3vw] font-bold">{host}/radyo</span>
        </div>
        {offline && <p className="text-center text-[0.9vw] text-amber-300">Sunucuya ulaşılamıyor, tekrar deneniyor…</p>}
      </aside>
    </div>
  );
}
