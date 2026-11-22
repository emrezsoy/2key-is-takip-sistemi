import { addDays, isWeekend, setHours, setMinutes, setSeconds, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { DurationUnit } from "@prisma/client";

const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;

function atHour(date: Date, hour: number) {
  return setSeconds(setMinutes(setHours(date, hour), 0), 0);
}

/**
 * Kişinin o gün çalışıp çalışmadığını belirler.
 * Puantajda kayıt varsa onu kullanır (FULL/HALF = çalışıyor, NONE/LEAVE = çalışmıyor).
 * Kayıt yoksa (gelecek tarih için henüz işaretlenmemiş) hafta içi günleri varsayılan çalışma günü sayar.
 */
async function isWorkDay(userId: string, date: Date): Promise<boolean> {
  const day = startOfDay(date);
  const attendance = await prisma.attendance.findUnique({
    where: { userId_date: { userId, date: day } },
  });

  if (attendance) {
    return attendance.dayType === "FULL" || attendance.dayType === "HALF";
  }

  return !isWeekend(day);
}

/**
 * Görev süresine göre gerçek teslim tarihini hesaplar.
 * "X gün" -> kişinin çalışacağı günler sayılarak ileriye sayılır.
 * "X saat" -> kişinin 09:00-18:00 mesaisine göre hesaplanır, gün aşımında bir sonraki çalışma gününe taşar.
 */
export async function calculateDeadline(
  userId: string,
  durationValue: number,
  durationUnit: DurationUnit,
  from: Date = new Date()
): Promise<Date> {
  if (durationUnit === "DAY") {
    let remaining = durationValue;
    let cursor = startOfDay(from);

    while (remaining > 0) {
      cursor = addDays(cursor, 1);
      if (await isWorkDay(userId, cursor)) {
        remaining -= 1;
      }
    }

    return atHour(cursor, WORK_END_HOUR);
  }

  // HOUR
  let remainingHours = durationValue;
  let cursor = from;

  // Başlangıç noktasını geçerli bir mesai anına oturt.
  while (
    !(await isWorkDay(userId, cursor)) ||
    cursor < atHour(cursor, WORK_START_HOUR) ||
    cursor >= atHour(cursor, WORK_END_HOUR)
  ) {
    if (cursor < atHour(cursor, WORK_START_HOUR) && (await isWorkDay(userId, cursor))) {
      cursor = atHour(cursor, WORK_START_HOUR);
      break;
    }
    cursor = atHour(addDays(cursor, 1), WORK_START_HOUR);
  }

  while (remainingHours > 0) {
    const dayEnd = atHour(cursor, WORK_END_HOUR);
    const hoursLeftToday = (dayEnd.getTime() - cursor.getTime()) / 36e5;

    if (remainingHours <= hoursLeftToday) {
      cursor = new Date(cursor.getTime() + remainingHours * 36e5);
      remainingHours = 0;
    } else {
      remainingHours -= hoursLeftToday;
      cursor = atHour(addDays(cursor, 1), WORK_START_HOUR);
      while (!(await isWorkDay(userId, cursor))) {
        cursor = atHour(addDays(cursor, 1), WORK_START_HOUR);
      }
    }
  }

  return cursor;
}
