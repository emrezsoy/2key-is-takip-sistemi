"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { finishOnboardingCallAction, saveOnboardingFieldAction } from "@/lib/actions/dmOnboarding";

type Line = { role: "assistant" | "user"; text: string };
const MAX_SEC = 15 * 60;

/** Sesli kurulum görüşmesi (OpenAI Realtime, WebRTC). WhatsApp sesli arama görünümü. Asistan görüşmeyi kendisi kapatır. */
export function VoiceCall({ onboardingId, ownerName, onDone }: { onboardingId: string; ownerName: string | null; onDone: () => void }) {
  const [state, setState] = useState<"idle" | "connecting" | "live" | "ending" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sec, setSec] = useState(0);
  const [muted, setMuted] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lines = useRef<Line[]>([]);
  const started = useRef(0);
  const ended = useRef(false);

  const hangup = async () => {
    if (ended.current) return;
    ended.current = true;
    setState("ending");
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const duration = started.current ? (Date.now() - started.current) / 1000 : 0;
    try {
      await finishOnboardingCallAction(onboardingId, lines.current, duration);
    } finally {
      onDone();
    }
  };

  useEffect(() => {
    if (state !== "live") return;
    const t = setInterval(() => {
      const s = Math.round((Date.now() - started.current) / 1000);
      setSec(s);
      if (s >= MAX_SEC) void hangup();
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const send = (ev: unknown) => dcRef.current?.readyState === "open" && dcRef.current.send(JSON.stringify(ev));

  const handleEvent = async (ev: Record<string, unknown>) => {
    const type = String(ev.type ?? "");
    if (type === "response.output_audio_transcript.done" && typeof ev.transcript === "string") lines.current.push({ role: "assistant", text: ev.transcript });
    if (type.includes("input_audio_transcription") && type.endsWith("completed") && typeof ev.transcript === "string") lines.current.push({ role: "user", text: ev.transcript });
    if (type === "response.done") {
      const output = ((ev.response as { output?: unknown[] })?.output ?? []) as { type?: string; name?: string; arguments?: string; call_id?: string }[];
      let endCall = false;
      let answered = false;
      for (const item of output) {
        if (item.type !== "function_call" || !item.call_id) continue;
        let args: Record<string, string> = {};
        try {
          args = JSON.parse(item.arguments || "{}");
        } catch {
          args = {};
        }
        let result: unknown = { ok: true };
        if (item.name === "save_field") {
          try {
            result = await saveOnboardingFieldAction(onboardingId, String(args.key ?? ""), String(args.value ?? ""));
            setSaved((s) => [...new Set([...s, String(args.key ?? "")])]);
          } catch (e) {
            result = { ok: false, error: e instanceof Error ? e.message : "kaydedilemedi" };
          }
        } else if (item.name === "end_call") {
          endCall = true;
        }
        send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: item.call_id, output: JSON.stringify(result) } });
        answered = true;
      }
      if (endCall) {
        // Veda cümlesinin çalınması için kısa bekleme.
        setTimeout(() => void hangup(), 2500);
      } else if (answered) {
        send({ type: "response.create" });
      }
    }
    if (type === "error") setError(String((ev.error as { message?: string })?.message ?? "Bağlantı hatası"));
  };

  const start = async () => {
    setError(null);
    setState("connecting");
    try {
      const res = await fetch("/api/dm/onboarding/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ onboardingId }) });
      const data = (await res.json()) as { clientSecret?: string; error?: string };
      if (!res.ok || !data.clientSecret) throw new Error(data.error ?? "Görüşme başlatılamadı.");
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      const audio = audioRef.current!;
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0];
      };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (m) => {
        try {
          void handleEvent(JSON.parse(m.data));
        } catch {
          // yoksay
        }
      };
      dc.onopen = () => {
        started.current = Date.now();
        setState("live");
        send({ type: "response.create", response: { instructions: `Kendini kısaca tanıt${ownerName ? ` ve ${ownerName}'a adıyla hitap et` : ""}, sonra ilk soruyla başla.` } });
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdp = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.clientSecret}`, "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      if (!sdp.ok) throw new Error(`Ses bağlantısı kurulamadı (${sdp.status}).`);
      await pc.setRemoteDescription({ type: "answer", sdp: await sdp.text() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Görüşme başlatılamadı.");
      setState("error");
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }
  };

  const toggleMute = () => {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };

  const mm = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 rounded-3xl bg-gradient-to-b from-emerald-900 to-slate-900 px-6 py-8 text-white shadow-card">
      <audio ref={audioRef} autoPlay />
      <div className={`flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-3xl font-bold ${state === "connecting" ? "animate-pulse" : ""}`}>2K</div>
      <div className="text-center">
        <p className="text-lg font-semibold">Kurulum asistanı</p>
        <p className="text-sm text-white/70">
          {state === "idle" && "Hazır olduğunuzda görüşmeyi başlatın"}
          {state === "connecting" && "Bağlanıyor…"}
          {state === "live" && mm}
          {state === "ending" && "Görüşme kaydediliyor…"}
          {state === "error" && "Bağlantı kurulamadı"}
        </p>
      </div>
      {saved.length > 0 && <p className="text-center text-[11px] text-white/60">Kaydedilen bilgiler: {saved.length}</p>}
      {error && <p className="text-center text-xs text-rose-300">{error}</p>}
      {state === "idle" || state === "error" ? (
        <button type="button" onClick={() => void start()} className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-bold">
          Görüşmeyi başlat
        </button>
      ) : (
        <div className="flex items-center gap-6">
          <button type="button" onClick={toggleMute} disabled={state !== "live"} className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15" aria-label="Mikrofon">
            {muted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>
          <button type="button" onClick={() => void hangup()} disabled={state === "ending"} className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-600" aria-label="Kapat">
            <PhoneOff size={22} />
          </button>
        </div>
      )}
      <p className="text-center text-[11px] text-white/50">Mikrofon izni istenecek. Görüşme en fazla 15 dakika sürer; asistan bitince kendisi kapatır.</p>
    </div>
  );
}
