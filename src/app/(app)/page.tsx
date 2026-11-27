import Image from "next/image";
import { CheckCircle2, FileText, ListTodo } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { visibleUserIds } from "@/lib/permissions";
import { getLedClientIds } from "@/lib/clientAccess";
import { staffHasContentAccess } from "@/lib/contentAccess";
import { defaultClientColor } from "@/components/share/palette";
import { applyClientOrder } from "@/lib/clientOrder";
import { creatorLabelOf, formatDate, ROLE_LABEL, URGENCY_RANK } from "@/lib/format";
import { requestSendableOf } from "@/lib/deliveryUtil";
import { loadClientApprovals, loadContentLinkedTasks } from "@/lib/taskApproval";
import { getGreetingParts } from "@/lib/greeting";
import { StatCard } from "@/components/dashboard/StatCard";
import { KanbanBoard, type BoardTask } from "@/components/dashboard/KanbanBoard";
import { EmployeeJobs, type EmployeeJob } from "@/components/dashboard/EmployeeJobs";
import { NewTaskModal } from "@/components/dashboard/NewTaskModal";
import { MiniCalendar } from "@/components/dashboard/MiniCalendar";
import { BoardWorkspace } from "@/components/board/BoardWorkspace";
import type { Assignee, BoardClient, BoardJob } from "@/components/board/types";

type StatTask = {
  id: string;
  title: string;
  status: string;
  calculatedDeadline: Date | null;
  clientName: string | null;
};

function Hero({
  firstName,
  inProgress,
  upcoming,
}: {
  firstName: string;
  inProgress: number;
  upcoming: number;
}) {
  const { prefix, suffix } = getGreetingParts();
  return (
    <div className="relative overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-surface) p-6">
      <div className="max-w-lg">
        <div className="mb-3 h-1 w-10 rounded-full bg-brand-600" />
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          {prefix}
          <span className="text-brand-600">{firstName}</span>
          {suffix}
        </h1>
        <p className="mt-2 text-sm text-(--color-text-muted)">
          Bugün {inProgress} devam eden görev, {upcoming} yaklaşan teslim var.
        </p>
      </div>
      <Image
        src="/brand/statue.png"
        alt=""
        width={220}
        height={260}
        className="pointer-events-none absolute -right-4 -top-2 hidden h-[220px] w-auto opacity-90 sm:block"
      />
    </div>
  );
}

function Stats({ total, done }: { total: number; done: number }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <StatCard icon={FileText} value={total} label="Toplam Görev" />
      <StatCard icon={CheckCircle2} value={done} label="Tamamlanan" accent="green" />
    </div>
  );
}

function UpcomingCard({ items }: { items: StatTask[] }) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold">Yaklaşan Teslimler</h3>
      </div>
      <div className="space-y-3">
        {items.length === 0 && (
          <p className="flex items-center gap-2 text-xs text-(--color-text-muted)">
            <ListTodo size={14} /> Yaklaşan teslim yok
          </p>
        )}
        {items.map((t) => (
          <div key={t.id} className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-brand-600 text-[10px] font-bold leading-none text-white">
              {t.calculatedDeadline && formatDate(t.calculatedDeadline).split(" ")[0]}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{t.title}</p>
              <p className="text-xs text-(--color-text-muted)">{t.clientName ?? "—"}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivitiesCard({
  activities,
}: {
  activities: { id: string; message: string; user: { fullName: string } }[];
}) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
      <h3 className="mb-3 text-sm font-bold">Son Aktiviteler</h3>
      <div className="space-y-3">
        {activities.length === 0 && (
          <p className="text-xs text-(--color-text-muted)">Henüz aktivite yok</p>
        )}
        {activities.map((a) => (
          <div key={a.id} className="text-xs">
            <span className="font-semibold">{a.user.fullName}</span>{" "}
            <span className="text-(--color-text-muted)">{a.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Müşteri kartları panosunun verisi: admin tüm müşterileri, müşteri sorumlusu sadece sorumlu olduklarını görür. */
async function loadBoardData(userId: string, isAdmin: boolean, ledClientIds: string[]) {
  const [clientsRaw, boardTasksRaw, assigneeUsers, workload, colorRows, me] = await Promise.all([
    prisma.client.findMany({
      where: isAdmin ? { isActive: true } : { id: { in: ledClientIds } },
      select: { id: true, name: true, leads: { select: { id: true, fullName: true } } },
    }),
    prisma.task.findMany({
      where: isAdmin ? {} : { clientId: { in: ledClientIds } },
      include: {
        assignedTo: { select: { id: true, fullName: true } },
        createdBy: { select: { fullName: true, role: true } },
        request: { select: { id: true, kind: true, sourceRequestId: true, files: { orderBy: { position: "asc" }, select: { id: true, url: true, name: true } } } },
        submissions: { orderBy: [{ position: "asc" }, { uploadedAt: "asc" }] },
        attachments: { orderBy: { position: "asc" } },
        revisionFiles: { orderBy: { position: "asc" } },
      },
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        isDeleted: false,
        role: isAdmin ? { not: "CLIENT" } : { notIn: ["ADMIN", "CLIENT"] },
      },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.task.groupBy({
      by: ["assignedToId"],
      where: { status: { not: "DONE" }, assignedToId: { not: null } },
      _count: { _all: true },
    }),
    // Renk: Paylaşım Takvimi ile aynı kural (elle seçilen, yoksa tüm aktif müşterilerin alfabetik sırasına göre otomatik).
    prisma.client.findMany({
      where: { isActive: true },
      select: { id: true, shareColor: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { clientOrder: true } }),
  ]);
  const colorOf = new Map(colorRows.map((c, i) => [c.id, c.shareColor ?? defaultClientColor(i)] as const));
  const [approvals, fromContent] = await Promise.all([loadClientApprovals(boardTasksRaw.map((t) => t.id)), loadContentLinkedTasks(boardTasksRaw.map((t) => t.id))]);

  const jobs: BoardJob[] = boardTasksRaw.map((t) => ({
    clientApproval: approvals.get(t.id) ?? null,
    fromContent: fromContent.has(t.id),
    id: t.id,
    title: t.title,
    description: t.description,
    urgency: t.urgency,
    difficulty: t.difficulty,
    calculatedDeadline: t.calculatedDeadline,
    status: t.status,
    fileUrl: t.fileUrl,
    fileName: t.fileName,
    revisionNote: t.revisionNote,
    caption: t.caption,
    submissions: t.submissions.map((s) => ({
      id: s.id,
      fileUrl: s.fileUrl,
      fileName: s.fileName,
      downloadedAt: s.downloadedAt,
    })),
    clientId: t.clientId,
    assignedToId: t.assignedToId,
    assigneeName: t.assignedTo?.fullName ?? null,
    creatorLabel: creatorLabelOf(t.createdBy, t.request?.kind),
    requestFiles: t.request?.files ?? [],
    requestId: t.request?.id,
    requestSendable: requestSendableOf(t.request),
    attachments: t.attachments.map((a) => ({ id: a.id, url: a.fileUrl, name: a.fileName })),
    revisionFiles: t.revisionFiles.map((f) => ({ id: f.id, url: f.url, name: f.name, old: !!f.archivedAt })),
    createdAt: t.createdAt,
  }));

  const alphabetical: BoardClient[] = clientsRaw
    .sort((a, b) => a.name.localeCompare(b.name, "tr"))
    .map((c) => ({
      id: c.id,
      name: c.name,
      color: colorOf.get(c.id),
      leads: c.leads.map((l) => ({ id: l.id, name: l.fullName })),
      jobs: jobs.filter((j) => j.clientId === c.id),
      canAdd: true,
    }));

  // Kişinin kendi sürükleyerek belirlediği sıra; kaydı yoksa alfabetik.
  const boardClients: BoardClient[] = applyClientOrder(alphabetical, me?.clientOrder);

  if (isAdmin) {
    const orphanJobs = jobs.filter((j) => j.clientId === null);
    if (orphanJobs.length > 0) {
      boardClients.push({
        id: null,
        name: "Müşterisiz İşler",
        leads: [],
        jobs: orphanJobs,
        canAdd: false,
      });
    }
  }

  const counts = new Map(
    workload.map((w) => [w.assignedToId, w._count._all] as const)
  );
  const assignees: Assignee[] = assigneeUsers.map((u) => ({
    id: u.id,
    name: u.fullName,
    roleLabel: ROLE_LABEL[u.role] ?? u.role,
    activeCount: counts.get(u.id) ?? 0,
  }));

  return { clientsRaw, boardClients, assignees, assigneeUsers };
}

/** Çalışan paneli. Kendisine iletilen işler "Gelen İşler" / "Tamamlanan İşler" listesinde durur.
 * Müşteri sorumlusu ise sorumlu olduğu müşterilerin kutu kartları (admin panelindeki gibi) ayrıca üstte yer alır. */
async function EmployeeHome({ userId, name }: { userId: string; name: string }) {
  const ledClientIds = await getLedClientIds(userId);

  const include = {
    client: { select: { name: true } },
    assignedTo: { select: { fullName: true } },
    createdBy: { select: { fullName: true, role: true } },
    request: { select: { id: true, kind: true, sourceRequestId: true, files: { orderBy: { position: "asc" as const }, select: { id: true, url: true, name: true } } } },
    submissions: { orderBy: [{ position: "asc" as const }, { uploadedAt: "asc" as const }] },
    attachments: { orderBy: { position: "asc" as const } },
    revisionFiles: { orderBy: { position: "asc" as const } },
  };
  const [openRaw, doneRaw, board] = await Promise.all([
    prisma.task.findMany({
      where: { assignedToId: userId, status: { not: "DONE" } },
      include,
    }),
    prisma.task.findMany({
      where: { assignedToId: userId, status: "DONE" },
      include,
      orderBy: { completedAt: "desc" },
      take: 50,
    }),
    ledClientIds.length > 0 ? loadBoardData(userId, false, ledClientIds) : null,
  ]);

  const [approvals, fromContent] = await Promise.all([loadClientApprovals([...openRaw, ...doneRaw].map((t) => t.id)), loadContentLinkedTasks([...openRaw, ...doneRaw].map((t) => t.id))]);
  const toJob = (t: (typeof openRaw)[number]): EmployeeJob => ({
    clientApproval: approvals.get(t.id) ?? null,
    fromContent: fromContent.has(t.id),
    id: t.id,
    title: t.title,
    description: t.description,
    urgency: t.urgency,
    difficulty: t.difficulty,
    calculatedDeadline: t.calculatedDeadline,
    status: t.status,
    fileUrl: t.fileUrl,
    fileName: t.fileName,
    revisionNote: t.revisionNote,
    caption: t.caption,
    submissions: t.submissions.map((s) => ({
      id: s.id,
      fileUrl: s.fileUrl,
      fileName: s.fileName,
      downloadedAt: s.downloadedAt,
    })),
    clientName: t.client?.name ?? null,
    assigneeName: t.assignedTo?.fullName ?? "Atanmadı",
    creatorLabel: creatorLabelOf(t.createdBy, t.request?.kind),
    requestFiles: t.request?.files ?? [],
    requestId: t.request?.id,
    requestSendable: requestSendableOf(t.request),
    attachments: t.attachments.map((a) => ({ id: a.id, url: a.fileUrl, name: a.fileName })),
    revisionFiles: t.revisionFiles.map((f) => ({ id: f.id, url: f.url, name: f.name, old: !!f.archivedAt })),
    canWork: true,
    canReview: false,
    completedAt: t.completedAt,
  });

  // En acil ve teslimi en yakın iş en üstte.
  const incoming = openRaw.map(toJob).sort(
    (a, b) =>
      URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency] ||
      (a.calculatedDeadline?.getTime() ?? Infinity) - (b.calculatedDeadline?.getTime() ?? Infinity)
  );
  const completed = doneRaw.map(toJob);

  const inProgress = incoming.filter((j) => j.status === "IN_PROGRESS").length;
  const upcoming = incoming.filter(
    (j) =>
      j.calculatedDeadline &&
      j.calculatedDeadline.getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000
  ).length;

  return (
    <div className="space-y-6">
      <Hero firstName={name.split(" ")[0]} inProgress={inProgress} upcoming={upcoming} />

      {board && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Sorumlu Olduğum Müşteriler</h2>
          <BoardWorkspace
            clients={board.boardClients}
            assignees={board.assignees}
            viewer={{ id: userId, role: "EMPLOYEE", canContent: await staffHasContentAccess({ id: userId, role: "EMPLOYEE" }) }}
          />
        </section>
      )}

      <section>
        {board && <h2 className="mb-3 text-lg font-bold">Bana İletilen İşler</h2>}
        <EmployeeJobs incoming={incoming} completed={completed} />
      </section>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user;
  const isAdmin = user.role === "ADMIN";
  const isEmployeeView = user.role === "EMPLOYEE";

  if (isEmployeeView) return <EmployeeHome userId={user.id} name={user.name ?? user.username} />;

  // Müşteri sorumlusu olan süpervizörler yöneticiyle aynı müşteri panosunu görür.
  const ledClientIds = isAdmin ? [] : await getLedClientIds(user.id);
  const showBoard = isAdmin || ledClientIds.length > 0;

  const allUsers = await prisma.user.findMany({
    select: { id: true, supervisorId: true, fullName: true, role: true },
  });
  const scopeIds = await visibleUserIds(user, allUsers);

  // Kanban: çalışan/süpervizör için kendi (ve ekibinin) işleri; admin için sadece kendisine atananlar.
  const tasksRaw = await prisma.task.findMany({
    where: { assignedToId: isAdmin ? user.id : { in: scopeIds } },
    include: {
      client: true,
      assignedTo: true,
      createdBy: { select: { fullName: true, role: true } },
      request: { select: { id: true, kind: true, sourceRequestId: true, files: { orderBy: { position: "asc" }, select: { id: true, url: true, name: true } } } },
      submissions: { orderBy: [{ position: "asc" }, { uploadedAt: "asc" }] },
      attachments: { orderBy: { position: "asc" } },
        revisionFiles: { orderBy: { position: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  const [taskApprovals, fromContent] = await Promise.all([loadClientApprovals(tasksRaw.map((t) => t.id)), loadContentLinkedTasks(tasksRaw.map((t) => t.id))]);
  const tasks: BoardTask[] = tasksRaw.map((t) => ({
    clientApproval: taskApprovals.get(t.id) ?? null,
    fromContent: fromContent.has(t.id),
    id: t.id,
    title: t.title,
    description: t.description,
    urgency: t.urgency,
    difficulty: t.difficulty,
    calculatedDeadline: t.calculatedDeadline,
    status: t.status,
    fileUrl: t.fileUrl,
    fileName: t.fileName,
    revisionNote: t.revisionNote,
    caption: t.caption,
    submissions: t.submissions.map((s) => ({
      id: s.id,
      fileUrl: s.fileUrl,
      fileName: s.fileName,
      downloadedAt: s.downloadedAt,
    })),
    clientName: t.client?.name ?? null,
    assigneeName: t.assignedTo?.fullName ?? "Atanmadı",
    creatorLabel: creatorLabelOf(t.createdBy, t.request?.kind),
    requestFiles: t.request?.files ?? [],
    requestId: t.request?.id,
    requestSendable: requestSendableOf(t.request),
    attachments: t.attachments.map((a) => ({ id: a.id, url: a.fileUrl, name: a.fileName })),
    revisionFiles: t.revisionFiles.map((f) => ({ id: f.id, url: f.url, name: f.name, old: !!f.archivedAt })),
  }));

  // İstatistikler: admin tüm işleri (atanmamışlar dahil), diğerleri kendi kapsamını görür.
  const statTasks: StatTask[] = isAdmin
    ? (
        await prisma.task.findMany({
          select: {
            id: true,
            title: true,
            status: true,
            calculatedDeadline: true,
            client: { select: { name: true } },
          },
        })
      ).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        calculatedDeadline: t.calculatedDeadline,
        clientName: t.client?.name ?? null,
      }))
    : tasksRaw.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        calculatedDeadline: t.calculatedDeadline,
        clientName: t.client?.name ?? null,
      }));

  const stats = {
    total: statTasks.length,
    inProgress: statTasks.filter((t) => t.status === "IN_PROGRESS").length,
    upcoming: statTasks.filter(
      (t) =>
        t.calculatedDeadline &&
        t.status !== "DONE" &&
        t.calculatedDeadline.getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000
    ).length,
    done: statTasks.filter((t) => t.status === "DONE").length,
  };

  const upcoming = statTasks
    .filter((t) => t.status !== "DONE" && t.calculatedDeadline)
    .sort(
      (a, b) =>
        (a.calculatedDeadline?.getTime() ?? 0) - (b.calculatedDeadline?.getTime() ?? 0)
    )
    .slice(0, 4);

  const activities = await prisma.activity.findMany({
    where: { userId: { in: scopeIds } },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const firstName = (user.name ?? user.username).split(" ")[0];

  if (showBoard) {
    const { clientsRaw, boardClients, assignees, assigneeUsers } = await loadBoardData(
      user.id,
      isAdmin,
      ledClientIds
    );

    const showOwnKanban = !isAdmin || tasks.length > 0;

    return (
      <div className="space-y-6">
        <Hero firstName={firstName} inProgress={stats.inProgress} upcoming={stats.upcoming} />
        <Stats total={stats.total} done={stats.done} />

        <section>
          <h2 className="mb-3 text-lg font-bold">Müşteriler ve İşler</h2>
          <BoardWorkspace
            clients={boardClients}
            assignees={assignees}
            viewer={{
              id: user.id,
              role: user.role === "CLIENT" ? "EMPLOYEE" : user.role,
              canContent: await staffHasContentAccess(user),
            }}
          />
        </section>

        {showOwnKanban && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {user.role === "SUPERVISOR" ? "İşlerim ve Ekibim" : "Benim İşlerim"}
              </h2>
              {user.role === "SUPERVISOR" && (
                <NewTaskModal
                  clients={clientsRaw.map((c) => ({ id: c.id, label: c.name }))}
                  employees={assigneeUsers.map((e) => ({ id: e.id, label: e.fullName }))}
                  canSetUrgency
                  canSetDifficulty={false}
                />
              )}
            </div>
            <KanbanBoard tasks={tasks} role={isEmployeeView ? "employee" : "admin"} />
          </section>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <UpcomingCard items={upcoming} />
          <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
            <MiniCalendar />
          </div>
          <ActivitiesCard activities={activities} />
        </div>
      </div>
    );
  }

  const [clients, employees] = await Promise.all([
    prisma.client.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { isActive: true, isDeleted: false, role: { in: ["EMPLOYEE", "SUPERVISOR", "ADMIN"] } },
      select: { id: true, fullName: true },
    }),
  ]);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-6">
        <Hero firstName={firstName} inProgress={stats.inProgress} upcoming={stats.upcoming} />
        <Stats total={stats.total} done={stats.done} />

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Görevler</h2>
            {!isEmployeeView && (
              <NewTaskModal
                clients={clients.map((c) => ({ id: c.id, label: c.name }))}
                employees={employees.map((e) => ({ id: e.id, label: e.fullName }))}
                canSetUrgency={user.role === "SUPERVISOR"}
                canSetDifficulty={false}
              />
            )}
          </div>
          <KanbanBoard tasks={tasks} role={isEmployeeView ? "employee" : "admin"} />
        </div>
      </div>

      <div className="space-y-4">
        <UpcomingCard items={upcoming} />
        <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
          <MiniCalendar />
        </div>
        <ActivitiesCard activities={activities} />
      </div>
    </div>
  );
}
