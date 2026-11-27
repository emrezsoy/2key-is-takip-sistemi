import { headers } from "next/headers";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { googleCalendarLink, upcomingAppointments } from "@/lib/dm/appointments";
import { fmtTr, localDay } from "@/lib/dm/availability";
import { cardCls, chip } from "../ui";
import { AppointmentDecision } from "./AppointmentDecision";
import { AvailabilityEditor, CalendarFeed, CancelAppointmentButton, ManualAppointmentForm } from "./AppointmentForms";

type Pending = { id: string; startAt: Date; customerName: string; customerPhone: string | null; service: string | null; note: string | null; conversationId: string | null };

/** Bekleyen randevu talepleri (onay / ret / alternatif). */
export function PendingAppointments({ items, basePath }: { clientId: string; items: Pending[]; basePath: string }) {
  return (
    <section className={cardCls}>
      <h3 className="text-sm font-bold">Randevu talepleri</h3>
      <p className="text-xs text-(--color-text-muted)">Kararınız AI tarafından kişiye iletilir. Alternatif önerirseniz kişi kabul edince randevu kendiliğinden kesinleşir.</p>
      <ul>
        {items.map((a) => (
          <li key={a.id} className="space-y-1.5 border-b border-(--color-border) py-2.5 text-sm last:border-0">
            <p>
              <span className="font-semibold">{a.customerName}</span> · {fmtTr(a.startAt)}
              {a.service ? ` · ${a.service}` : ""}
              {a.customerPhone ? ` · ${a.customerPhone}` : ""}
              {a.conversationId && (
                <Link href={`${basePath}?sekme=gelen&k=${a.conversationId}`} className="ml-2 text-xs underline">
                  konuşma
                </Link>
              )}
            </p>
            {a.note && <p className="text-xs text-(--color-text-muted)">{a.note}</p>}
            <AppointmentDecision id={a.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const STATUS: Record<string, { t: string; c: string }> = {
  CONFIRMED: { t: "Onaylı", c: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  REQUESTED: { t: "Onay bekliyor", c: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  RESCHEDULE_PROPOSED: { t: "Alternatif önerildi", c: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300" },
};

export async function AppointmentsTab({ clientId }: { clientId: string; basePath: string }) {
  const [list, config, rules, client] = await Promise.all([
    upcomingAppointments(clientId, undefined, 60),
    prisma.dmConfig.findUnique({ where: { clientId } }),
    prisma.dmAvailabilityRule.findMany({ where: { clientId }, orderBy: [{ weekday: "asc" }, { startTime: "asc" }] }),
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true } }),
  ]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const byDay = new Map<string, typeof list>();
  for (const a of list) {
    const d = localDay(a.startAt).date;
    byDay.set(d, [...(byDay.get(d) ?? []), a]);
  }
  const dateLabel = (d: Date) => new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Istanbul" }).format(d);
  const time = (d: Date) => new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }).format(d);
  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <section className={cardCls}>
        <h3 className="mb-2 text-sm font-bold">Takvim (60 gün)</h3>
        {list.length === 0 && <p className="text-xs text-(--color-text-muted)">Yaklaşan randevu yok.</p>}
        {[...byDay].map(([d, items]) => (
          <div key={d} className="mb-3">
            <p className="mb-1 text-xs font-semibold text-(--color-text-muted)">{dateLabel(items[0].startAt)}</p>
            <ul className="space-y-1">
              {items.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-(--color-border) px-2 py-1.5 text-sm">
                  <span className="font-semibold">{time(a.status === "RESCHEDULE_PROPOSED" && a.proposedStartAt ? a.proposedStartAt : a.startAt)}</span>
                  <span>{a.customerName ?? "—"}</span>
                  {a.service && <span className="text-xs text-(--color-text-muted)">{a.service}</span>}
                  {a.customerPhone && <span className="text-xs text-(--color-text-muted)">{a.customerPhone}</span>}
                  <span className={`${chip} ${STATUS[a.status]?.c ?? ""}`}>{STATUS[a.status]?.t ?? a.status}</span>
                  {a.source === "MANUAL" && <span className="text-[10px] text-(--color-text-muted)">elle</span>}
                  <span className="ml-auto flex items-center gap-3">
                    <a href={googleCalendarLink(a, client.name)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-600">
                      Google Takvim&apos;e ekle
                    </a>
                    <CancelAppointmentButton id={a.id} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <div className="space-y-4">
        <ManualAppointmentForm clientId={clientId} />
        <AvailabilityEditor
          clientId={clientId}
          durationMin={config?.appointmentDurationMin ?? 60}
          gapMin={config?.appointmentGapMin ?? 0}
          weekly={rules.filter((r) => r.kind === "WEEKLY_OPEN").map((r) => ({ weekday: r.weekday!, startTime: r.startTime!, endTime: r.endTime! }))}
          closed={rules
            .filter((r) => r.kind === "CLOSED_RANGE" && r.startAt && r.endAt)
            .map((r) => ({ from: localDay(r.startAt!).date, to: localDay(r.endAt!).date, note: r.note ?? undefined }))}
        />
        <CalendarFeed clientId={clientId} url={config?.calendarToken ? `${origin}/api/dm/calendar/${config.calendarToken}.ics` : null} />
      </div>
    </div>
  );
}
