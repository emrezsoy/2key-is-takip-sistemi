import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { staffHasContentAccess } from "@/lib/contentAccess";
import { canManageClientJobs } from "@/lib/clientAccess";
import { loadContent, loadContentMonths, parseMonthParams } from "@/lib/contentData";
import { ContentWorkspace } from "@/components/content/ContentWorkspace";

export default async function ClientContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !(await staffHasContentAccess(session.user))) redirect("/");

  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!client) notFound();

  const sp = await searchParams;
  const { year, month } = parseMonthParams(sp.y, sp.m);
  const [{ items, docs }, months, canManage] = await Promise.all([
    loadContent(client.id, year, month),
    loadContentMonths(client.id),
    canManageClientJobs(session.user, client.id),
  ]);
  // Onaylanan teslimi paylaşım takvimine gönderme / yanlış teslimi kaldırma: admin ya da müşterinin sorumlusu.
  const canSend = canManage;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-(--color-text-muted) hover:text-brand-600">
          <ArrowLeft size={13} /> Ana sayfa
        </Link>
        <h1 className="text-xl font-bold">{client.name} — İçerikler</h1>
        <p className="text-sm text-(--color-text-muted)">
          Müşterinin kendi yazdığı ve sizin müşteri adına girdiğiniz içerikler. Burada yazdıklarınız müşteri panelinde de görünür.
        </p>
      </div>
      <ContentWorkspace
        clientId={client.id}
        basePath={`/musteriler/${client.id}/icerik`}
        year={year}
        month={month}
        items={items}
        docs={docs}
        canEdit
        canAddJob={canManage}
        months={months}
        canSendCalendar={canSend}
        canClearDelivery={canSend}
        // Müşteri onayı olmayan müşteriler için: sadece admin (süpervizör / sorumlu değil).
        canAdminApprove={session.user.role === "ADMIN"}
      />
    </div>
  );
}
