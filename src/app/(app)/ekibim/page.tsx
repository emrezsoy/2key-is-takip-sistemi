import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MONTHS } from "@/lib/format";
import { AttendanceCalendar } from "@/components/attendance/AttendanceCalendar";
import type { DayType } from "@prisma/client";

export default async function EkibimPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await auth();
  const user = session!.user;
  if (user.role !== "SUPERVISOR") redirect("/");

  const now = new Date();
  const { year: yearParam, month: monthParam } = await searchParams;
  const year = Number(yearParam) || now.getFullYear();
  const month = Number(monthParam) || now.getMonth() + 1;

  const rangeStart = new Date(Date.UTC(year, month - 1, 1));
  const rangeEnd = new Date(Date.UTC(year, month, 1));

  const team = await prisma.user.findMany({
    where: { supervisorId: user.id, isActive: true, isDeleted: false },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, paymentType: true, dailyRate: true, monthlyRate: true },
  });

  const attendanceRows = await prisma.attendance.findMany({
    where: {
      userId: { in: team.map((t) => t.id) },
      date: { gte: rangeStart, lt: rangeEnd },
    },
  });

  const initialAttendance: Record<string, Record<number, DayType>> = {};
  for (const row of attendanceRows) {
    initialAttendance[row.userId] ??= {};
    initialAttendance[row.userId][row.date.getUTCDate()] = row.dayType;
  }

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Ekibim</h1>
          <p className="text-sm text-(--color-text-muted)">
            Ekibinin puantaj takvimini görüntüleyebilirsin (düzenleme yetkisi admin&apos;de).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/ekibim?year=${prevYear}&month=${prevMonth}`}
            className="rounded-lg border border-(--color-border) p-2 hover:bg-(--color-surface-muted)"
          >
            <ChevronLeft size={16} />
          </Link>
          <span className="w-32 text-center text-sm font-semibold">
            {MONTHS[month - 1]} {year}
          </span>
          <Link
            href={`/ekibim?year=${nextYear}&month=${nextMonth}`}
            className="rounded-lg border border-(--color-border) p-2 hover:bg-(--color-surface-muted)"
          >
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      <AttendanceCalendar
        year={year}
        month={month}
        employees={team.map((t) => ({
          id: t.id,
          fullName: t.fullName,
          paymentType: t.paymentType,
          dailyRate: t.dailyRate ? Number(t.dailyRate) : null,
          monthlyRate: t.monthlyRate ? Number(t.monthlyRate) : null,
        }))}
        initialAttendance={initialAttendance}
        editable={false}
      />
    </div>
  );
}
