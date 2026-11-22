import { AlertTriangle, CheckCircle2, Clock3, ListTodo, Timer } from "lucide-react";
import { startOfWeek, subWeeks, startOfMonth, subMonths, format } from "date-fns";
import { tr } from "date-fns/locale";
import { prisma } from "@/lib/prisma";
import { visibleUserIds } from "@/lib/permissions";
import { StatCard } from "@/components/dashboard/StatCard";
import { BarChart } from "@/components/charts/BarChart";

/** Süpervizörlerin gördüğü ekip raporu (kendi ekibi): çalışılan gün, görev sayıları ve süreler. Yöneticiler yeni Ajans / Müşteri raporlarını görür. */
export async function TeamReport({
  user,
  userId = "tumu",
}: {
  user: { id: string; role: "ADMIN" | "SUPERVISOR" | "EMPLOYEE" | "CLIENT" };
  userId?: string;
}) {
  const allUsers = await prisma.user.findMany({
    select: { id: true, supervisorId: true, fullName: true, role: true, isDeleted: true },
  });
  const scopeIds = await visibleUserIds(user, allUsers);
  const scopedUsers = allUsers.filter(
    (u) => scopeIds.includes(u.id) && u.role !== "ADMIN" && u.role !== "CLIENT" && !u.isDeleted
  );

  const filterIds = userId === "tumu" ? scopeIds : [userId];

  const tasks = await prisma.task.findMany({
    where: { assignedToId: { in: filterIds } },
  });

  const attendance = await prisma.attendance.findMany({
    where: { userId: { in: filterIds } },
  });

  const totalFullDays = attendance.filter((a) => a.dayType === "FULL").length;
  const totalHalfDays = attendance.filter((a) => a.dayType === "HALF").length;
  const totalWorkedDays = totalFullDays + totalHalfDays * 0.5;

  const activeCount = tasks.filter((t) => t.status !== "DONE").length;
  const doneTasks = tasks.filter((t) => t.status === "DONE" && t.completedAt);
  const doneCount = doneTasks.length;

  const overdueCount = tasks.filter(
    (t) =>
      t.status !== "DONE" &&
      t.calculatedDeadline &&
      t.calculatedDeadline.getTime() < Number(new Date())
  ).length;

  const avgActualHours =
    doneTasks.length === 0
      ? 0
      : doneTasks.reduce((sum, t) => {
          const hours = Math.max(
            0,
            (t.completedAt!.getTime() - t.createdAt.getTime()) / 36e5
          );
          return sum + hours;
        }, 0) / doneTasks.length;

  // Süre girilmemiş (hızlı eklenen) işler "verilen süre" ortalamasına katılmaz.
  const tasksWithDuration = doneTasks.filter((t) => t.durationValue && t.durationUnit);
  const avgGivenHours =
    tasksWithDuration.length === 0
      ? 0
      : tasksWithDuration.reduce((sum, t) => {
          const value = t.durationValue ?? 0;
          return sum + (t.durationUnit === "DAY" ? value * 9 : value);
        }, 0) / tasksWithDuration.length;

  const selectedPerson =
    userId !== "tumu" ? scopedUsers.find((u) => u.id === userId) : null;

  const weeklyCompleted = Array.from({ length: 8 }, (_, i) => {
    const weekStart = startOfWeek(subWeeks(new Date(), 7 - i), { weekStartsOn: 1 });
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const count = doneTasks.filter(
      (t) =>
        t.completedAt! >= weekStart && t.completedAt! < weekEnd
    ).length;
    return { label: format(weekStart, "d MMM", { locale: tr }), value: count };
  });

  const monthlyWorkedDays = Array.from({ length: 6 }, (_, i) => {
    const monthStart = startOfMonth(subMonths(new Date(), 5 - i));
    const monthEnd = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      1
    );
    const days = attendance
      .filter((a) => a.date >= monthStart && a.date < monthEnd)
      .reduce((s, a) => {
        if (a.dayType === "FULL") return s + 1;
        if (a.dayType === "HALF") return s + 0.5;
        return s;
      }, 0);
    return { label: format(monthStart, "MMM", { locale: tr }), value: days };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold">Rapor</h1>
        <form className="flex items-center gap-2">
          <label className="text-sm text-(--color-text-muted)">Kişi:</label>
          <select
            name="userId"
            defaultValue={userId}
            className="rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-1.5 text-sm"
          >
            <option value="tumu">Tüm ekip</option>
            {scopedUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Filtrele
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Clock3} value={totalWorkedDays} label="Çalışılan Gün" />
        <StatCard icon={ListTodo} value={activeCount} label="Aktif Görev" />
        <StatCard icon={CheckCircle2} value={doneCount} label="Tamamlanan" accent="green" />
        <StatCard
          icon={Timer}
          value={`${avgGivenHours.toFixed(1)} sa`}
          label="Ort. Verilen Süre"
        />
        <StatCard
          icon={Timer}
          value={`${avgActualHours.toFixed(1)} sa`}
          label="Ort. Gerçek Süre"
        />
        <StatCard icon={AlertTriangle} value={overdueCount} label="Geciken Görev" />
      </div>

      <p className="text-xs text-(--color-text-muted)">
        Çalışılan gün: puantajda tam gün 1, yarım gün 0.5 olarak sayılır. Ort.
        verilen/gerçek süre, tamamlanan görevlerin planlanan süresi ile
        oluşturulma-tamamlanma arasındaki gerçek süreyi karşılaştırır (1 gün =
        9 saat mesai kabul edilir).
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
          <h3 className="mb-4 text-sm font-bold">
            {selectedPerson ? selectedPerson.fullName : "Tüm Ekip"} — Haftalık
            Tamamlanan Görev
          </h3>
          <BarChart data={weeklyCompleted} unit="görev" />
        </div>
        <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
          <h3 className="mb-4 text-sm font-bold">
            {selectedPerson ? selectedPerson.fullName : "Tüm Ekip"} — Aylık
            Çalışılan Gün
          </h3>
          <BarChart data={monthlyWorkedDays} unit="gün" />
        </div>
      </div>
    </div>
  );
}
