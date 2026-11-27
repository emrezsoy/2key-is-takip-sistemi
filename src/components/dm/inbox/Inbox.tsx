"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Ban, Flame, CalendarClock, Hand, Send, User, AlertCircle } from "lucide-react";
import type { InboxConversation, InboxMessage } from "@/lib/dm/workspace";
import { markConversationRead, sendHumanReply, setContactAiBlocked, setConversationMode } from "@/lib/actions/dmInbox";
import { useAction } from "../useAction";
import { Feedback } from "../Feedback";
import { chip, fmtDateTime } from "../ui";
import { useDmLive } from "./useDmLive";

type Selected = {
  id: string;
  channel: "INSTAGRAM" | "FACEBOOK";
  name: string;
  contact: { id: string; phone: string | null; email: string | null; aiBlocked: boolean; username: string | null };
  mode: "AI" | "HUMAN";
  handoffReason: string | null;
  waitingHuman: boolean;
  summary: string | null;
  windowEndsAt: Date | null;
  windowOpen: boolean;
  messages: InboxMessage[];
};

const ChannelBadge = ({ channel }: { channel: "INSTAGRAM" | "FACEBOOK" }) => (
  <span
    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white ${channel === "INSTAGRAM" ? "bg-gradient-to-br from-fuchsia-500 to-amber-400" : "bg-blue-600"}`}
    title={channel === "INSTAGRAM" ? "Instagram" : "Facebook"}
  >
    {channel === "INSTAGRAM" ? "IG" : "FB"}
  </span>
);

const FILTERS = [
  { key: "", label: "Tümü" },
  { key: "insan", label: "İnsan bekliyor" },
  { key: "sicak", label: "Sıcak" },
  { key: "randevu", label: "Randevu" },
];

function remaining(end: Date | null) {
  if (!end) return null;
  const ms = new Date(end).getTime() - Date.now();
  if (ms <= 0) return "kapandı";
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
}

function MessageBubble({ m, showCost }: { m: InboxMessage; showCost: boolean }) {
  const out = m.direction === "OUT";
  if (m.sender === "SYSTEM" && !m.text && m.referral) {
    return (
      <div className="mx-auto max-w-[85%] rounded-lg bg-(--color-surface-muted) px-3 py-1.5 text-center text-[11px] text-(--color-text-muted)">
        {m.referral.label}
        {m.referral.summary && <span className="block">{m.referral.summary.slice(0, 220)}</span>}
      </div>
    );
  }
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm sm:max-w-[70%] ${
          out
            ? m.sender === "AI"
              ? "rounded-br-sm bg-brand-600 text-white"
              : "rounded-br-sm bg-slate-700 text-white dark:bg-slate-600"
            : "rounded-bl-sm border border-(--color-border) bg-(--color-surface)"
        }`}
      >
        {m.referral && (
          <p className={`mb-1 rounded-md px-2 py-1 text-[11px] ${out ? "bg-white/15" : "bg-(--color-surface-muted)"}`}>
            {m.referral.label}
            {m.referral.summary && <span className="block opacity-80">{m.referral.summary.slice(0, 220)}</span>}
          </p>
        )}
        {m.media.map((a, i) =>
          a.type === "image" && a.url ? (
            <a key={i} href={a.url} target="_blank" rel="noreferrer" className="mb-1 block">
              {/* eslint-disable-next-line @next/next/no-img-element -- Meta CDN adresi, Next görsel optimizasyonundan geçmez */}
              <img src={a.url} alt="Gönderilen görsel" className="max-h-56 rounded-lg object-cover" />
            </a>
          ) : (
            <p key={i} className={`mb-1 rounded-md px-2 py-1 text-[11px] ${out ? "bg-white/15" : "bg-(--color-surface-muted)"}`}>
              📎 {a.type}
              {a.url && (
                <a href={a.url} target="_blank" rel="noreferrer" className="ml-1 underline">
                  aç
                </a>
              )}
            </p>
          )
        )}
        {m.media.some((a) => a.summary) && (
          <p className={`mb-1 text-[11px] italic ${out ? "opacity-80" : "text-(--color-text-muted)"}`}>
            AI analizi: {m.media.find((a) => a.summary)?.summary?.slice(0, 240)}
          </p>
        )}
        {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
        <p className={`mt-1 flex items-center gap-1 text-[10px] ${out ? "justify-end opacity-80" : "text-(--color-text-muted)"}`}>
          {out && (m.sender === "AI" ? <Bot size={11} /> : <User size={11} />)}
          {out && (m.sender === "AI" ? "AI" : m.sentByName ?? "İnsan")}
          {" · "}
          {fmtDateTime(m.createdAt)}
          {showCost && m.creditCost ? ` · ${m.creditCost} kredi` : ""}
          {m.status === "FAILED" && <span className="font-semibold text-amber-200"> · gönderilemedi</span>}
          {m.status === "PENDING" && " · gönderiliyor"}
        </p>
        {m.status === "FAILED" && m.error && <p className="text-[10px] opacity-80">{m.error}</p>}
      </div>
    </div>
  );
}

function Chat({ c, basePath, showCost }: { c: Selected; basePath: string; showCost: boolean }) {
  const [text, setText] = useState("");
  const { pending, error, info, run } = useAction();
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [c.messages.length]);
  useEffect(() => {
    void markConversationRead(c.id).catch(() => {});
  }, [c.id, c.messages.length]);
  const left = remaining(c.windowEndsAt);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-(--color-border) px-3 py-2">
        <Link href={basePath} scroll={false} className="rounded p-1 hover:bg-(--color-surface-muted) lg:hidden" aria-label="Geri">
          <ArrowLeft size={18} />
        </Link>
        <ChannelBadge channel={c.channel} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{c.name}</p>
          <p className="truncate text-[11px] text-(--color-text-muted)">
            {[c.contact.username && `@${c.contact.username}`, c.contact.phone, c.contact.email].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {c.mode === "AI" ? (
            <button type="button" disabled={pending} onClick={() => run(() => setConversationMode(c.id, "HUMAN"), "Konuşmayı devraldınız; AI karışmayacak.")} className="flex items-center gap-1 rounded-lg border border-(--color-border) px-2 py-1 text-xs font-semibold hover:bg-(--color-surface-muted)">
              <Hand size={13} /> Devral
            </button>
          ) : (
            <button type="button" disabled={pending} onClick={() => run(() => setConversationMode(c.id, "AI"), "AI yeni mesajlara cevap verecek.")} className="flex items-center gap-1 rounded-lg border border-(--color-border) px-2 py-1 text-xs font-semibold hover:bg-(--color-surface-muted)">
              <Bot size={13} /> AI&apos;a geri ver
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setContactAiBlocked(c.id, !c.contact.aiBlocked), c.contact.aiBlocked ? "AI bu kişiye yeniden cevap verebilir." : "AI bu kişiye cevap vermeyecek.")}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold ${c.contact.aiBlocked ? "border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-200" : "border-(--color-border) hover:bg-(--color-surface-muted)"}`}
            title="Bu kişiye AI cevap vermesin"
          >
            <Ban size={13} /> {c.contact.aiBlocked ? "AI engelli" : "AI cevap vermesin"}
          </button>
        </div>
      </div>
      {(c.handoffReason || c.mode === "HUMAN") && (
        <p className="border-b border-(--color-border) bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          Konuşma insanda{c.handoffReason ? `: ${c.handoffReason}` : ""}. AI bu konuşmaya cevap vermiyor.
        </p>
      )}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-(--color-bg) p-3">
        {c.messages.map((m) => (
          <MessageBubble key={m.id} m={m} showCost={showCost} />
        ))}
        <div ref={endRef} />
      </div>
      <form
        className="border-t border-(--color-border) p-2"
        onSubmit={(e) => {
          e.preventDefault();
          const body = text;
          run(() => sendHumanReply(c.id, body), undefined, () => setText(""));
        }}
      >
        {!c.windowOpen ? (
          <p className="flex items-center gap-1 px-1 py-2 text-xs text-(--color-text-muted)">
            <AlertCircle size={13} /> 24 saat penceresi kapandı: Meta, kişi yeniden yazana kadar mesaj gönderilmesine izin vermiyor.
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              rows={2}
              maxLength={1000}
              placeholder="Cevap yazın (gönderince konuşmayı siz devralırsınız)"
              className="min-h-[2.5rem] flex-1 resize-none rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <button type="submit" disabled={pending || !text.trim()} className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white disabled:opacity-50" aria-label="Gönder">
              <Send size={16} />
            </button>
          </div>
        )}
        <div className="flex items-center justify-between px-1 pt-1">
          <Feedback error={error} info={info} />
          {left && c.windowOpen && <span className="ml-auto text-[10px] text-(--color-text-muted)">Pencere: {left}</span>}
        </div>
      </form>
    </div>
  );
}

export function Inbox({
  clientId,
  basePath,
  conversations,
  selected,
  filter,
  showCost,
}: {
  clientId: string;
  basePath: string;
  conversations: InboxConversation[];
  selected: Selected | null;
  filter: string;
  showCost: boolean;
}) {
  useDmLive(clientId);
  const link = (q: Record<string, string>) => {
    const p = new URLSearchParams({ sekme: "gelen", ...(filter ? { f: filter } : {}), ...q });
    return `${basePath}?${p.toString()}`;
  };
  return (
    <div className="grid h-[calc(100dvh-14rem)] min-h-[28rem] overflow-hidden rounded-xl border border-(--color-border) bg-(--color-surface) lg:grid-cols-[20rem_1fr]">
      <div className={`flex min-h-0 flex-col border-r border-(--color-border) ${selected ? "hidden lg:flex" : "flex"}`}>
        <div className="flex gap-1 overflow-x-auto border-b border-(--color-border) p-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`${basePath}?${new URLSearchParams({ sekme: "gelen", ...(f.key ? { f: f.key } : {}) })}`}
              scroll={false}
              className={`${chip} shrink-0 ${filter === f.key ? "bg-brand-600 text-white" : "bg-(--color-surface-muted) text-(--color-text-muted)"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {conversations.length === 0 && <li className="p-4 text-sm text-(--color-text-muted)">Henüz mesaj yok.</li>}
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={link({ k: c.id })}
                scroll={false}
                className={`flex gap-2 border-b border-(--color-border) px-3 py-2.5 hover:bg-(--color-surface-muted) ${selected?.id === c.id ? "bg-(--color-surface-muted)" : ""}`}
              >
                <ChannelBadge channel={c.channel} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <p className={`truncate text-sm ${c.unread ? "font-bold" : "font-medium"}`}>{c.name}</p>
                    <span className="ml-auto shrink-0 text-[10px] text-(--color-text-muted)">{fmtDateTime(c.lastAt)}</span>
                  </div>
                  <p className="truncate text-xs text-(--color-text-muted)">{c.lastText || "—"}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.mode === "HUMAN" ? <span className={`${chip} bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300`}>👤 İnsan</span> : <span className={`${chip} bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300`}>🤖 AI</span>}
                    {c.waitingHuman && <span className={`${chip} bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300`}>İnsan bekliyor</span>}
                    {c.hotLead && (
                      <span className={`${chip} flex items-center gap-0.5 bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300`}>
                        <Flame size={10} /> Sıcak
                      </span>
                    )}
                    {c.appointmentRequested && (
                      <span className={`${chip} flex items-center gap-0.5 bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300`}>
                        <CalendarClock size={10} /> Randevu
                      </span>
                    )}
                    {c.aiBlocked && <span className={`${chip} bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300`}>AI engelli</span>}
                    {c.unread > 0 && <span className={`${chip} bg-brand-600 text-white`}>{c.unread}</span>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className={`min-h-0 ${selected ? "flex flex-col" : "hidden lg:flex lg:items-center lg:justify-center"}`}>
        {selected ? <Chat c={selected} basePath={link({})} showCost={showCost} /> : <p className="text-sm text-(--color-text-muted)">Soldan bir konuşma seçin.</p>}
      </div>
    </div>
  );
}
