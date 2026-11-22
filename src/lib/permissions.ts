import { Role } from "@prisma/client";

export type SessionUser = {
  id: string;
  role: Role;
};

export const isAdmin = (user: SessionUser) => user.role === "ADMIN";
export const isSupervisor = (user: SessionUser) => user.role === "SUPERVISOR";
export const isEmployee = (user: SessionUser) => user.role === "EMPLOYEE";

export const canManageClients = (user: SessionUser) => isAdmin(user);
export const canManageEmployees = (user: SessionUser) => isAdmin(user);
export const canEditAttendance = (user: SessionUser) => isAdmin(user);
export const canSetDifficulty = (user: SessionUser) => isAdmin(user);
export const canSetUrgency = (user: SessionUser) =>
  isAdmin(user) || isSupervisor(user);
export const canCreateTask = (user: SessionUser) =>
  isAdmin(user) || isSupervisor(user);
export const canViewReports = (user: SessionUser) =>
  isAdmin(user) || isSupervisor(user);

/** Rapor ve görev listelerinde görülebilecek çalışan id'leri. Admin herkesi,
 * süpervizör kendi ekibini (+ kendisini), çalışan sadece kendisini görür. */
export async function visibleUserIds(
  user: SessionUser,
  allUserIds: { id: string; supervisorId: string | null }[]
): Promise<string[]> {
  if (isAdmin(user)) return allUserIds.map((u) => u.id);
  if (isSupervisor(user)) {
    const team = allUserIds
      .filter((u) => u.supervisorId === user.id)
      .map((u) => u.id);
    return [user.id, ...team];
  }
  return [user.id];
}
