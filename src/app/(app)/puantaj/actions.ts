"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditAttendance } from "@/lib/permissions";
import type { DayType } from "@prisma/client";

export async function setAttendance(userId: string, dateISO: string, dayType: DayType) {
  const session = await auth();
  if (!session?.user || !canEditAttendance(session.user)) {
    throw new Error("Bu işlem için yetkiniz yok.");
  }

  const date = new Date(dateISO);

  await prisma.attendance.upsert({
    where: { userId_date: { userId, date } },
    update: { dayType },
    create: { userId, date, dayType },
  });
}
