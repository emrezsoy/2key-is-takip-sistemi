"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Ban, Bot, Check, ChevronLeft, Clock3, Hand, MoreVertical, Send, X } from "lucide-react";
import type { InboxMessage } from "@/lib/dm/workspace";
import { markConversationRead, sendHumanReply, setContactAiBlocked, setConversationMode } from "@/lib/actions/dmInbox";
import { useAction } from "../useAction";
import { Avatar, clockTime, dayKey, dayLabel } from "./parts";

export type ChatData = {
  id: string;
  channel: "INSTAGRAM" | "FACEBOOK";
  name: string;
  avatar: string | null;
  contact: { id: string; phone: string | null; email: string | null; aiBlocked: boolean; username: string | null };
  mode: "AI" | "HUMAN";
  handoffReason: string | null;
  waitingHuman: boolean;
  windowEndsAt: Date | null;
  windowOpen: boolean;
  messages: InboxMessage[];
};

function remaining(end: Date | null) {
  if (!end) return null;
  const ms = new Date(end).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
}

function Bubble({ m }: { m: InboxMessage }) {
  const out = m.direction === "OUT";
  if (m.sender === "SYSTEM" && !m.text && m.referral) {
    return (
      <div className="my-1 flex justify-center">
        <p className="max-w-[85%] rounded-lg bg-(--color-surface) px-3 py-1.5 text-center text-[12px] text-(--color-text-muted) shadow-sm">
          {m.referral.label}
          {m.referral.summary && <span className="mt-0.5 block">{m.referral.summary.slice(0, 220)}</span>}
        </p>
      </div>
    );
  }
  const tone = !out
    ? "bg-(--color-surface) rounded-tl-md"
    : m.sender === "AI"
      ? "bg-[#ffe1e2] dark:bg-[#5b1418] rounded-tr-md"
      : "bg-[#e5edf3] dark:bg-[#1f2e38] rounded-tr-md";
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div className={`relative max-w-[82%] rounded-2xl px-3 pb-1.5 pt-2 text-[15px] leading-snug shadow-sm sm:max-w-[70%] ${tone}`}>
        {out && <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-brand-600 dark:text-[#ff8a8f]">{m.sender === "AI" ? <><Bot size={12} /> AI asistan</> : <><Hand size={12} /> {m.sentByName ?? "Siz"}</>}</p>}
        {m.referral && (
          <p className="mb-1.5 rounded-lg border-l-4 border-brand-500 bg-black/5 px-2 py-1 text-[12px] dark:bg-white/5">
            <span className="font-semibold">{m.referral.label}</span>
            {m.referral.summary && <span className="block opacity-80">{m.referral.summary.slice(0, 220)}</span>}
          </p>
        )}
        {m.media.map((a, i) =>
          a.type === "image" && a.url ? (
            <a key={i} href={a.url} target="_blank" rel="noreferrer" className="mb-1 block">
              {/* eslint-disable-next-line @next/next/no-img-element -- Meta CDN adresi */}
              <img src={a.url} alt="Gönderilen görsel" className="max-h-64 rounded-xl object-cover" />
            </a>
          ) : (
            <p key={i} className="mb-1 rounded-lg bg-black/5 px-2 py-1 text-[12px] dark:bg-white/5">
              📎 {a.type === "video" || a.type === "reel" ? "Video" : a.type === "audio" ? "Ses kaydı" : a.type === "story_mention" ? "Hikâyede bahsetme" : a.type === "share" || a.type === "post" ? "Paylaşılan gönderi" : "Ek"}
              {a.url && (
                <a href={a.url} target="_blank" rel="noreferrer" className="ml-1 font-semibold underline">
                  aç
                </a>
              )}
            </p>
          )
        )}
        {m.media.some((a) => a.summary) && <p className="mb-1 text-[12px] italic opacity-75">AI analizi: {m.media.find((a) => a.summary)?.summary?.slice(0, 240)}</p>}
        {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
        <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-(--color-text-muted)">
          {clockTime(m.createdAt)}
          {out && (m.status === "PENDING" ? <Clock3 size={12} /> : m.status === "FAILED" ? <AlertCircle size={12} className="text-rose-500" /> : <Check size={13} className="text-sky-500" />)}
        </p>
        {m.status === "FAILED" && <p className="text-[11px] text-rose-500">Gönderilemedi{m.error ? `: ${m.error}` : ""}</p>}
      </div>
    </div>
  );
}

/** Tam ekran sohbet (WhatsApp benzeri): üst bar, günlere ayrılmış mesajlar, alttaki yazma kutusu. */
export function ChatView({ c }: { c: ChatData }) {
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const { pending, error, info, run } = useAction();
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [c.messages.length]);
  useEffect(() => {
    void markConversationRead(c.id).catch(() => {});
  }, [c.id, c.messages.length]);
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [text]);

  const left = remaining(c.windowEndsAt);
  const status = c.contact.aiBlocked ? "AI bu kişiye cevap vermiyor" : c.mode === "HUMAN" ? "Siz yanıtlıyorsunuz" : "AI yanıtlıyor";
  const sub = [c.channel === "INSTAGRAM" ? "Instagram" : "Facebook", c.contact.username && `@${c.contact.username}`].filter(Boolean).join(" · ");

  const rows = c.messages.map((m, i) => ({
    m,
    sep: i === 0 || dayKey(new Date(m.createdAt)) !== dayKey(new Date(c.messages[i - 1].createdAt)),
  }));
  return (
    <div className="fixed inset-0 z-30 mx-auto flex h-dvh max-w-3xl flex-col bg-(--color-bg)">
      <header className="z-10 flex items-center gap-2 border-b border-(--color-border) bg-(--color-surface) px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href="/mesaj" className="flex items-center rounded-full p-1 text-brand-500" aria-label="Sohbetler">
          <ChevronLeft size={28} />
        </Link>
        <Avatar name={c.name} src={c.avatar} channel={c.channel} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold leading-tight">{c.name}</p>
          <p className="truncate text-[12px] text-(--color-text-muted)">
            <span className={c.mode === "AI" && !c.contact.aiBlocked ? "text-emerald-500" : "text-amber-500"}>{status}</span> · {sub}
          </p>
        </div>
        <button type="button" onClick={() => setMenu(true)} className="rounded-full p-2 text-(--color-text-muted) active:bg-(--color-surface-muted)" aria-label="Seçenekler">
          <MoreVertical size={20} />
        </button>
      </header>

      {(c.waitingHuman || (c.mode === "HUMAN" && c.handoffReason)) && (
        <p className="border-b border-(--color-border) bg-amber-500/10 px-4 py-2 text-[12px] text-amber-600 dark:text-amber-300">
          {c.waitingHuman ? "Bu kişi sizin cevabınızı bekliyor" : "Konuşma sizde"}
          {c.handoffReason ? `: ${c.handoffReason}` : ""}. AI bu konuşmaya cevap vermiyor.
        </p>
      )}

      <div className="dm-chat-bg min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
        {c.messages.length === 0 && <p className="py-10 text-center text-sm text-(--color-text-muted)">Henüz mesaj yok.</p>}
        {rows.map(({ m, sep }) => {
          return (
            <div key={m.id}>
              {sep && (
                <div className="my-3 flex justify-center">
                  <span suppressHydrationWarning className="rounded-lg bg-(--color-surface) px-3 py-1 text-[12px] font-medium text-(--color-text-muted) shadow-sm">
                    {dayLabel(m.createdAt)}
                  </span>
                </div>
              )}
              <Bubble m={m} />
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="border-t border-(--color-border) bg-(--color-surface) px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        {!c.windowOpen ? (
          <p className="flex items-start gap-2 px-2 py-2 text-[13px] text-(--color-text-muted)">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> 24 saatlik mesaj süresi doldu. Kişi yeniden yazana kadar Meta mesaj göndermeye izin vermiyor.
          </p>
        ) : (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const body = text;
              if (!body.trim()) return;
              run(() => sendHumanReply(c.id, body), undefined, () => setText(""));
            }}
          >
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={1}
              maxLength={1000}
              placeholder={c.mode === "AI" ? "Mesaj yazın (gönderince konuşmayı devralırsınız)" : "Mesaj yazın"}
              className="max-h-36 min-h-[2.75rem] flex-1 resize-none rounded-3xl border border-(--color-border) bg-(--color-bg) px-4 py-2.5 text-[15px] leading-snug outline-none focus:border-brand-500"
            />
            <button type="submit" disabled={pending || !text.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white transition-opacity disabled:opacity-40" aria-label="Gönder">
              <Send size={19} />
            </button>
          </form>
        )}
        {(error || info || left) && (
          <div className="flex items-center gap-2 px-3 pt-1 text-[11px]">
            {error && <span className="text-rose-500">{error}</span>}
            {info && <span className="text-emerald-500">{info}</span>}
            {left && c.windowOpen && <span className="ml-auto text-(--color-text-muted)">Cevap süresi: {left}</span>}
          </div>
        )}
      </div>

      {menu && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenu(false)} />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl rounded-t-3xl bg-(--color-surface) p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center gap-3">
              <Avatar name={c.name} src={c.avatar} channel={c.channel} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{c.name}</p>
                <p className="truncate text-[12px] text-(--color-text-muted)">{[c.contact.username && `@${c.contact.username}`, c.contact.phone, c.contact.email].filter(Boolean).join(" · ") || sub}</p>
              </div>
              <button type="button" onClick={() => setMenu(false)} className="rounded-full p-2 text-(--color-text-muted)" aria-label="Kapat">
                <X size={20} />
              </button>
            </div>
            <div className="overflow-hidden rounded-2xl bg-(--color-bg)">
              {c.mode === "AI" ? (
                <button type="button" disabled={pending} onClick={() => run(() => setConversationMode(c.id, "HUMAN"), "Konuşmayı devraldınız; AI karışmayacak.", () => setMenu(false))} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px]">
                  <Hand size={20} className="text-amber-500" /> Konuşmayı devral
                  <span className="ml-auto text-[12px] text-(--color-text-muted)">AI susar</span>
                </button>
              ) : (
                <button type="button" disabled={pending} onClick={() => run(() => setConversationMode(c.id, "AI"), "AI yeni mesajlara cevap verecek.", () => setMenu(false))} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px]">
                  <Bot size={20} className="text-emerald-500" /> AI&apos;a geri ver
                  <span className="ml-auto text-[12px] text-(--color-text-muted)">AI cevaplar</span>
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => setContactAiBlocked(c.id, !c.contact.aiBlocked), c.contact.aiBlocked ? "AI bu kişiye yeniden cevap verebilir." : "AI bu kişiye cevap vermeyecek.", () => setMenu(false))}
                className="flex w-full items-center gap-3 border-t border-(--color-border) px-4 py-3.5 text-left text-[15px]"
              >
                <Ban size={20} className={c.contact.aiBlocked ? "text-emerald-500" : "text-rose-500"} />
                {c.contact.aiBlocked ? "Bu kişiye AI cevap verebilsin" : "Bu kişiye AI hiç cevap vermesin"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
