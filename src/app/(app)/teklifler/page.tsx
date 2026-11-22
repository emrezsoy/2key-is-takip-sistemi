import { redirect } from "next/navigation";
import Link from "next/link";
import { BellRing } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canUseProposals, hasChosenRecipients } from "@/lib/proposalAccess";
import { parseServices } from "@/lib/proposals";
import { ProposalForm } from "@/components/proposals/ProposalForm";
import { ProposalsView } from "@/components/proposals/ProposalsView";
import type { ProposalRow } from "@/components/proposals/types";

export default async function TekliflerPage() {
  const session = await auth();
  if (!session?.user) redirect("/giris");
  if (!(await canUseProposals(session.user))) redirect("/");
  const isAdmin = session.user.role === "ADMIN";

  const [list, chosen] = await Promise.all([
    prisma.proposal.findMany({
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { files: { orderBy: { version: "desc" } } },
    }),
    isAdmin ? hasChosenRecipients() : Promise.resolve(true),
  ]);

  const rows: ProposalRow[] = list.map((p) => ({
    id: p.id,
    companyName: p.companyName,
    companySize: p.companySize,
    kind: p.kind,
    fromReport: p.fromReport,
    services: parseServices(p.services),
    customService: p.customService,
    contactName: p.contactName,
    contactPhone: p.contactPhone,
    date: p.date,
    status: p.status,
    resultNote: p.resultNote,
    createdByName: p.createdByName,
    files: p.files.map((f) => ({
      id: f.id,
      version: f.version,
      type: f.type,
      url: f.url,
      name: f.name,
      date: f.date,
      uploadedByName: f.uploadedByName,
    })),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Teklifler</h1>
        <p className="text-sm text-(--color-text-muted)">
          İşletmelere verdiğimiz teklif ve raporlar. Dosyalar Drive&apos;da &quot;Teklifler / Ay Yıl&quot; klasöründe saklanır.
        </p>
      </div>

      {isAdmin && !chosen && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/10 dark:text-amber-300">
          <BellRing size={15} className="mt-0.5 shrink-0" />
          <p>
            Hatırlatma bildirimi alacak kişi seçilmemiş; şimdilik tüm adminlere gider. Kişi seçmek için{" "}
            <Link href="/calisanlar" className="font-semibold underline">
              Çalışanlar
            </Link>{" "}
            ekranında kişiyi düzenleyip &quot;Teklifler sayfasını kullansın ve hatırlatma bildirimlerini alsın&quot; kutusunu işaretle.
          </p>
        </div>
      )}

      <ProposalForm />
      <ProposalsView rows={rows} />
    </div>
  );
}
