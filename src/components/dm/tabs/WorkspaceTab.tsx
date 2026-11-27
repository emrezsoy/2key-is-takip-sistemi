import { prisma } from "@/lib/prisma";
import { loadConversation, loadInbox, loadPending } from "@/lib/dm/workspace";
import { getAiDefaults } from "@/lib/dm/ai/settings";
import type { BusinessHours } from "@/lib/dm/hours";
import { Inbox } from "../inbox/Inbox";
import { MissedPanel, QuestionsPanel } from "../pending/QuestionsAndMissed";
import { BusinessInfoForm } from "../business/BusinessInfoForm";
import { PromptManager } from "../business/PromptManager";
import { KnowledgeList } from "../business/KnowledgeList";
import { TestBox } from "../business/TestBox";
import { ClientDmSettings } from "../settings/ClientDmSettings";
import { AppointmentsTab, PendingAppointments } from "../appointments/AppointmentsTab";
import { ProductsTab } from "../products/ProductsTab";
import { PendingFollowUps } from "../followups/PendingFollowUps";
import { OnboardingPanel } from "../onboarding/OnboardingPanel";
import { cardCls } from "../ui";

export type DmViewer = "ADMIN" | "STAFF" | "CLIENT";

/** Gelen kutusu, bekleyen işler, randevu, ürünler, işletme bilgileri, test ve ayarlar sekmeleri (admin ve müşteri panelinde ortak). */
export async function DmWorkspaceTab({
  tab,
  clientId,
  viewer,
  conversationId,
  basePath,
  filter,
}: {
  tab: string;
  clientId: string;
  viewer: DmViewer;
  conversationId?: string;
  basePath: string;
  filter?: string;
}) {
  const isAdmin = viewer === "ADMIN";

  if (tab === "gelen") {
    const [conversations, selected] = await Promise.all([
      loadInbox(clientId, filter),
      conversationId ? loadConversation(clientId, conversationId) : Promise.resolve(null),
    ]);
    return <Inbox clientId={clientId} basePath={basePath} conversations={conversations} selected={selected} filter={filter ?? ""} showCost={viewer !== "CLIENT"} />;
  }

  if (tab === "bekleyen") {
    const p = await loadPending(clientId);
    const empty = !p.questions.length && !p.appointments.length && !p.followUps.length && !p.missed.length;
    return (
      <div className="space-y-4">
        {empty && (
          <div className={cardCls}>
            <p className="text-sm text-(--color-text-muted)">Bekleyen iş yok.</p>
          </div>
        )}
        <MissedPanel clientId={clientId} missed={p.missed} />
        <QuestionsPanel questions={p.questions} basePath={basePath} />
        {p.appointments.length > 0 && <PendingAppointments clientId={clientId} items={p.appointments} basePath={basePath} />}
        {p.followUps.length > 0 && <PendingFollowUps clientId={clientId} items={p.followUps} basePath={basePath} />}
      </div>
    );
  }

  if (tab === "randevu") return <AppointmentsTab clientId={clientId} basePath={basePath} />;
  if (tab === "urunler") return <ProductsTab clientId={clientId} />;

  if (tab === "isletme") {
    const [info, config, versions, knowledge, ob, client] = await Promise.all([
      prisma.dmBusinessInfo.findFirst({ where: { clientId }, orderBy: { version: "desc" } }),
      prisma.dmConfig.findUnique({ where: { clientId } }),
      prisma.dmPromptVersion.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.dmKnowledgeItem.findMany({ where: { clientId }, orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }] }),
      prisma.dmOnboardingSession.findFirst({ where: { clientId }, orderBy: { createdAt: "desc" } }),
      prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true } }),
    ]);
    const activeId = config?.activePromptId ?? versions.find((v) => v.status === "APPROVED")?.id ?? null;
    const until = config?.holidayUntil
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(config.holidayUntil)
      : null;
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="xl:col-span-2">
          <OnboardingPanel
            clientId={clientId}
            clientName={client.name}
            isAdmin={isAdmin}
            ob={
              ob
                ? {
                    id: ob.id, status: ob.status, ownerName: ob.ownerName, businessName: ob.businessName,
                    fields: (ob.fields ?? {}) as Record<string, string>,
                    analysis: (ob.analysis ?? null) as never, promptDraft: ob.promptDraft,
                  }
                : null
            }
          />
        </div>
        <BusinessInfoForm
          clientId={clientId}
          data={(info?.data ?? {}) as Record<string, string>}
          hours={(config?.businessHours ?? null) as BusinessHours | null}
          holiday={{ on: config?.holidayMode ?? false, message: config?.holidayMessage ?? "", until }}
          version={info ? { n: info.version, by: info.createdByName, at: info.createdAt } : null}
        />
        <div className="space-y-4">
          <PromptManager
            clientId={clientId}
            isAdmin={isAdmin}
            versions={versions.map((v) => ({
              id: v.id, text: v.text, source: v.source, status: v.status, note: v.note, createdByName: v.createdByName,
              decidedByName: v.decidedByName, createdAt: v.createdAt, active: v.id === activeId,
            }))}
          />
          <KnowledgeList clientId={clientId} items={knowledge.map((k) => ({ id: k.id, question: k.question, answer: k.answer, isActive: k.isActive, source: k.source }))} />
        </div>
      </div>
    );
  }

  if (tab === "test") {
    const config = await prisma.dmConfig.findUnique({ where: { clientId }, select: { testSpendsCredit: true } });
    return <TestBox clientId={clientId} spendsCredit={config?.testSpendsCredit ?? false} showCost={viewer !== "CLIENT"} />;
  }

  if (tab === "ayarlar") {
    if (!isAdmin) {
      return (
        <div className={cardCls}>
          <p className="text-sm text-(--color-text-muted)">Bu ayarları yalnızca yöneticiler değiştirebilir.</p>
        </div>
      );
    }
    const [config, defaults, pages] = await Promise.all([
      prisma.dmConfig.upsert({ where: { clientId }, update: {}, create: { clientId } }),
      getAiDefaults(),
      prisma.socialAccount.findMany({ where: { clientId }, select: { pageId: true, pageName: true, igUsername: true } }),
    ]);
    return <ClientDmSettings clientId={clientId} cfg={config} defaults={defaults} pages={pages} />;
  }

  return null;
}
