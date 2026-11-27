"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bot, CalendarClock, Flame, Hand, Search, UserRound } from "lucide-react";
import type { InboxConversation } from "@/lib/dm/workspace";
import { Avatar, shortTime } from "./parts";

const FILTERS = [
  { key: "", label: "Tümü" },
  { key: "okunmamis", label: "Okunmamış" },
  { key: "insan", label: "İnsan bekliyor" },
  { key: "sicak", label: "Sıcak" },
  { key: "randevu", label: "Randevu" },
];

/** WhatsApp benzeri sohbet listesi: arama, filtre çipleri, profil fotoğrafı, okunmamış sayısı. */
export function ChatList({ conversations, filter }: { conversations: InboxConversation[]; filter: string }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLocaleLowerCase("tr-TR");
    return conversations.filter(
      (c) =>
        (filter !== "okunmamis" || c.unread > 0) &&
        (!s || c.name.toLocaleLowerCase("tr-TR").includes(s) || (c.username ?? "").toLowerCase().includes(s) || c.lastText.toLocaleLowerCase("tr-TR").includes(s))
    );
  }, [conversations, filter, q]);

  return (
    <div>
      <div className="px-4">
        <label className="flex items-center gap-2 rounded-xl bg-(--color-surface-muted) px-3 py-2 text-(--color-text-muted)">
          <Search size={17} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara" className="w-full bg-transparent text-[15px] text-(--color-text) outline-none placeholder:text-(--color-text-muted)" />
        </label>
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key ? `/mesaj?f=${f.key}` : "/mesaj"}
              scroll={false}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
                filter === f.key ? "bg-brand-500/20 text-brand-500" : "bg-(--color-surface-muted) text-(--color-text-muted)"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <ul className="mt-2">
        {list.length === 0 && (
          <li className="px-6 py-16 text-center text-sm text-(--color-text-muted)">{q ? "Sonuç yok." : filter ? "Bu filtrede sohbet yok." : "Henüz mesaj yok. Instagram ya da Facebook'tan gelen mesajlar burada görünür."}</li>
        )}
        {list.map((c) => {
          const unread = c.unread > 0;
          return (
            <li key={c.id}>
              <Link href={`/mesaj/s/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 active:bg-(--color-surface-muted)">
                <Avatar name={c.name} src={c.avatar} channel={c.channel} size={52} />
                <div className="min-w-0 flex-1 border-b border-(--color-border) pb-2.5">
                  <div className="flex items-baseline gap-2">
                    <p className={`truncate text-[16px] ${unread ? "font-bold" : "font-semibold"}`}>{c.name}</p>
                    <span suppressHydrationWarning className={`ml-auto shrink-0 text-xs ${unread ? "font-semibold text-brand-500" : "text-(--color-text-muted)"}`}>
                      {shortTime(c.lastAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="shrink-0 text-(--color-text-muted)" title={c.mode === "HUMAN" ? "Siz yanıtlıyorsunuz" : "AI yanıtlıyor"}>
                      {c.aiBlocked ? <UserRound size={14} /> : c.mode === "HUMAN" ? <Hand size={14} /> : <Bot size={14} />}
                    </span>
                    <p className={`min-w-0 flex-1 truncate text-[14px] ${unread ? "text-(--color-text)" : "text-(--color-text-muted)"}`}>{c.lastText || "—"}</p>
                    {c.hotLead && <Flame size={15} className="shrink-0 text-rose-500" aria-label="Sıcak müşteri" />}
                    {c.appointmentRequested && <CalendarClock size={15} className="shrink-0 text-sky-500" aria-label="Randevu" />}
                    {unread && (
                      <span className="min-w-[1.35rem] shrink-0 rounded-full bg-brand-500 px-1.5 text-center text-[11px] font-bold leading-[1.35rem] text-white">{c.unread}</span>
                    )}
                  </div>
                  {c.waitingHuman && <p className="mt-0.5 text-[12px] font-semibold text-amber-500">İnsan bekliyor{c.handoffReason ? ` · ${c.handoffReason}` : ""}</p>}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
