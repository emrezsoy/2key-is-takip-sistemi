import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MONTHS } from "@/lib/format";
import { AttendanceCalendar } from "@/components/attendance/AttendanceCalendar";
import type { DayType } from "@prisma/client";

export default async function CalismaPlanimPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await auth();
  const user = session!.user;

  const now = new Date();
  const { year: yearParam, month: monthParam } = await searchParams;
  const year = Number(yearParam) || now.getFullYear();
  const month = Number(monthParam) || now.getMonth() + 1;

  const rangeStart = new Date(Date.UTC(year, month - 1, 1));
  const rangeEnd = new Date(Date.UTC(year, month, 1));

  const me = await prisma.user.findUnique({ where: { id: user.id } });
  const attendanceRows = await prisma.attendance.findMany({
    where: { userId: user.id, date: { gte: rangeStart, lt: rangeEnd } },
  });

  const initialAttendance: Record<string, Record<number, DayType>> = {
    [user.id]: {},
  };
  for (const row of attendanceRows) {
    initialAttendance[user.id][row.date.getUTCDate()] = row.dayType;
  }

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Çalışma Planım</h1>
          <p className="text-sm text-(--color-text-muted)">
            Aylık çalışma planını görüntüleyebilirsin, değişiklik için yöneticinle konuş.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/calisma-planim?year=${prevYear}&month=${prevMonth}`}
            className="rounded-lg border border-(--color-border) p-2 hover:bg-(--color-surface-muted)"
          >
            <ChevronLeft size={16} />
          </Link>
          <span className="w-32 text-center text-sm font-semibold">
            {MONTHS[month - 1]} {year}
          </span>
          <Link
            href={`/calisma-planim?year=${nextYear}&month=${nextMonth}`}
            className="rounded-lg border border-(--color-border) p-2 hover:bg-(--color-surface-muted)"
          >
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      <AttendanceCalendar
        year={year}
        month={month}
        employees={[
          {
            id: user.id,
            fullName: me?.fullName ?? user.username,
            paymentType: "DAILY",
            dailyRate: null,
            monthlyRate: null,
          },
        ]}
        initialAttendance={initialAttendance}
        editable={false}
        showSummary={false}
      />
    </div>
  );
}
