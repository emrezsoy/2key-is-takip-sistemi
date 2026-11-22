import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageClients } from "@/lib/permissions";
import { NewClientModal } from "@/components/clients/NewClientModal";
import { EditClientModal } from "@/components/clients/EditClientModal";
import { ClientCredentialsModal } from "@/components/clients/ClientCredentialsModal";
import { ClientPortalModal } from "@/components/clients/ClientPortalModal";
import { toggleClientActive } from "./actions";

export default async function MusterilerPage() {
  const session = await auth();
  if (!session?.user || !canManageClients(session.user)) redirect("/");

  const clients = await prisma.client.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { tasks: true } },
      credentials: {
        select: { id: true, label: true, username: true, notes: true },
        orderBy: { createdAt: "asc" },
      },
      users: {
        where: { role: "CLIENT", isDeleted: false },
        select: { id: true, username: true, fullName: true, isActive: true, mustChangePassword: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Aktif Müşteriler</h1>
          <p className="text-sm text-(--color-text-muted)">
            {clients.filter((c) => c.isActive).length} aktif müşteri
          </p>
        </div>
        <NewClientModal />
      </div>

      <div className="overflow-x-auto rounded-xl border border-(--color-border) bg-(--color-surface)">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-(--color-surface-muted) text-xs uppercase text-(--color-text-muted)">
            <tr>
              <th className="px-4 py-3 font-semibold">Müşteri</th>
              <th className="px-4 py-3 font-semibold">İletişim</th>
              <th className="px-4 py-3 font-semibold">Görev sayısı</th>
              <th className="px-4 py-3 font-semibold">Durum</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-border)">
            {clients.map((c) => (
              <tr key={c.id} className={c.isActive ? "" : "opacity-60"}>
                <td className="px-4 py-3">
                  <p className="font-medium">{c.name}</p>
                  {c.notes && (
                    <p className="text-xs text-(--color-text-muted)">{c.notes}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-(--color-text-muted)">
                  {c.contact ?? "—"}
                </td>
                <td className="px-4 py-3 text-(--color-text-muted)">
                  {c._count.tasks}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      c.isActive
                        ? "bg-status-done/10 text-status-done"
                        : "bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300"
                    }`}
                  >
                    {c.isActive ? "Aktif" : "Pasif"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <ClientPortalModal
                      clientId={c.id}
                      clientName={c.name}
                      logins={c.users}
                      notifyMode={c.notifyMode}
                      paymentDueDay={c.paymentDueDay}
                      metaAdsManaged={c.metaAdsManaged}
                      googleAdsManaged={c.googleAdsManaged}
                      socialManaged={c.socialManaged}
                      contentEditable={c.contentEditable}
                      shareRevisionEnabled={c.shareRevisionEnabled}
                    />
                    <ClientCredentialsModal
                      clientId={c.id}
                      clientName={c.name}
                      credentials={c.credentials}
                    />
                    <EditClientModal client={c} />
                    <form action={toggleClientActive.bind(null, c.id, !c.isActive)}>
                      <button
                        type="submit"
                        className="text-xs font-medium text-(--color-text-muted) hover:text-brand-600"
                      >
                        {c.isActive ? "Pasife al" : "Aktifleştir"}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-(--color-text-muted)">
                  Henüz müşteri eklenmedi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
