import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageEmployees } from "@/lib/permissions";
import { formatCurrency, ROLE_LABEL } from "@/lib/format";
import { NewEmployeeModal } from "@/components/employees/NewEmployeeModal";
import { EditEmployeeModal } from "@/components/employees/EditEmployeeModal";
import { DeleteEmployeeModal } from "@/components/employees/DeleteEmployeeModal";

export default async function CalisanlarPage() {
  const session = await auth();
  if (!session?.user || !canManageEmployees(session.user)) redirect("/");

  const users = await prisma.user.findMany({
    where: { isDeleted: false, role: { not: "CLIENT" } },
    orderBy: { createdAt: "desc" },
    include: { supervisor: true, ledClients: { select: { id: true, name: true } } },
  });
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const clientOptions = clients.map((c) => ({ id: c.id, label: c.name }));
  const supervisors = users.filter((u) => u.role === "SUPERVISOR");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Çalışanlar</h1>
          <p className="text-sm text-(--color-text-muted)">
            {users.filter((u) => u.isActive).length} aktif kullanıcı
          </p>
        </div>
        <NewEmployeeModal
          supervisors={supervisors.map((s) => ({ id: s.id, label: s.fullName }))}
          clients={clientOptions}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-(--color-border) bg-(--color-surface)">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-(--color-surface-muted) text-xs uppercase text-(--color-text-muted)">
            <tr>
              <th className="px-4 py-3 font-semibold">Ad Soyad</th>
              <th className="px-4 py-3 font-semibold">Kullanıcı adı</th>
              <th className="px-4 py-3 font-semibold">Rol</th>
              <th className="px-4 py-3 font-semibold">Çalışma şekli</th>
              <th className="px-4 py-3 font-semibold">Süpervizör</th>
              <th className="px-4 py-3 font-semibold">Sorumlu müşteriler</th>
              <th className="px-4 py-3 font-semibold">Ücret</th>
              <th className="px-4 py-3 font-semibold">Durum</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-border)">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    {u.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.avatarUrl}
                        alt={u.fullName}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-200 text-xs font-semibold text-ink-700 dark:bg-ink-700 dark:text-ink-100">
                        {u.fullName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="font-medium">{u.fullName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-(--color-text-muted)">{u.username}</td>
                <td className="px-4 py-3 text-(--color-text-muted)">{ROLE_LABEL[u.role]}</td>
                <td className="px-4 py-3 text-(--color-text-muted)">
                  {u.employmentType ?? "—"}
                </td>
                <td className="px-4 py-3 text-(--color-text-muted)">
                  {u.supervisor?.fullName ?? "—"}
                </td>
                <td className="px-4 py-3 text-(--color-text-muted)">
                  {u.ledClients.length > 0
                    ? u.ledClients.map((c) => c.name).join(", ")
                    : "—"}
                </td>
                <td className="px-4 py-3 text-(--color-text-muted)">
                  {u.paymentType === "MONTHLY"
                    ? u.monthlyRate
                      ? `${formatCurrency(Number(u.monthlyRate))} / ay`
                      : "—"
                    : u.dailyRate
                      ? `${formatCurrency(Number(u.dailyRate))} / gün`
                      : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      u.isActive
                        ? "bg-status-done/10 text-status-done"
                        : "bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300"
                    }`}
                  >
                    {u.isActive ? "Aktif" : "Pasif"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.id !== session.user.id && (
                    <div className="flex items-center justify-end gap-1">
                      <EditEmployeeModal
                        user={{
                          id: u.id,
                          fullName: u.fullName,
                          email: u.email,
                          role: u.role,
                          employmentType: u.employmentType,
                          paymentType: u.paymentType,
                          dailyRate: u.dailyRate ? Number(u.dailyRate) : null,
                          monthlyRate: u.monthlyRate ? Number(u.monthlyRate) : null,
                          supervisorId: u.supervisorId,
                          isActive: u.isActive,
                          emailNotificationsEnabled: u.emailNotificationsEnabled,
                          shareCalendarAccess: u.shareCalendarAccess,
                          adPanelAccess: u.adPanelAccess,
                          adManageAccess: u.adManageAccess,
                          proposalAccess: u.proposalAccess,
                          contentAccess: u.contentAccess,
                          dmAccess: u.dmAccess,
                          leadClientIds: u.ledClients.map((c) => c.id),
                        }}
                        clients={clientOptions}
                        supervisors={supervisors
                          .filter((s) => s.id !== u.id)
                          .map((s) => ({ id: s.id, label: s.fullName }))}
                      />
                      <DeleteEmployeeModal userId={u.id} fullName={u.fullName} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
