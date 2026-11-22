"use client";

import { useState, useTransition } from "react";
import { Bell } from "lucide-react";
import { timeAgo } from "@/lib/format";
import { markAllNotificationsRead } from "@/lib/actions/notifications";

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
};

export function NotificationsBell({
  notifications,
  unreadCount,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      startTransition(() => {
        markAllNotificationsRead();
      });
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        className="relative rounded-full p-2 text-(--color-text-muted) hover:bg-(--color-surface-muted)"
        aria-label="Bildirimler"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-20 mt-2 w-80 max-w-[90vw] rounded-lg border border-(--color-border) bg-(--color-surface) shadow-card"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="border-b border-(--color-border) px-3 py-2 text-xs font-semibold text-(--color-text-muted)">
            Bildirimler
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-(--color-text-muted)">
                Henüz bildirim yok
              </p>
            )}
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`border-b border-(--color-border) px-3 py-2.5 last:border-0 ${
                  n.read ? "" : "bg-brand-50 dark:bg-brand-900/10"
                }`}
              >
                <p className="text-xs font-semibold">{n.title}</p>
                <p className="mt-0.5 text-xs text-(--color-text-muted)">{n.message}</p>
                <p className="mt-1 text-[10px] text-(--color-text-muted)">
                  {timeAgo(n.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
