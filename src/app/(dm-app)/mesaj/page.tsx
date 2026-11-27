import Link from "next/link";
import { redirect } from "next/navigation";
import { BotOff, Coins } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePortalUser } from "@/lib/clientPortal";
import { loadInbox } from "@/lib/dm/workspace";
import { creditState } from "@/lib/dm/credits";
import { ChatList } from "@/components/dm/app/ChatList";
import { DmPageHeader } from "@/components/dm/app/parts";
import { HoursWarning } from "@/components/dm/appointments/HoursWarning";

export const metadata = { title: "Sohbetler" };

export default async function DmChatsPage({ searchParams }: { searchParams: Promise<{ f?: string; k?: string }> }) {
  const { f, k } = await searchParams;
  // Ortak bileşenlerdeki "?sekme=gelen&k=…" bağlantıları sohbet ekranına yönlenir.
  if (k) redirect(`/mesaj/s/${encodeURIComponent(k)}`);
  const user = await requirePortalUser();
  const client = await prisma.client.findUniqueOrThrow({ where: { id: user.clientId }, select: { id: true, dmPaused: true, dmModuleAppointment: true } });
  const [conversations, state] = await Promise.all([loadInbox(client.id, f === "okunmamis" ? undefined : f), creditState(client.id)]);

  return (
    <>
      <DmPageHeader
        title="Sohbetler"
        right={
          <Link href="/mesaj/kredi" className="flex items-center gap-1.5 rounded-full bg-(--color-surface-muted) px-3 py-1.5 text-[13px] font-semibold">
            <Coins size={15} className="text-amber-500" /> {state.total} kredi
          </Link>
        }
      />
      <div className="space-y-2 px-4 empty:hidden">
        {client.dmPaused && (
          <Link href="/mesaj/kredi" className="flex items-center gap-2 rounded-xl bg-slate-500/15 px-3 py-2 text-[13px]">
            <BotOff size={16} className="shrink-0" /> AI kapalı: yeni mesajlara siz cevap veriyorsunuz. Açmak için dokunun.
          </Link>
        )}
        {!state.canReply && (
          <Link href="/mesaj/kredi" className="block rounded-xl bg-rose-500/15 px-3 py-2 text-[13px] text-rose-600 dark:text-rose-300">
            Krediniz bitti: AI yeni mesajlara cevap vermiyor. Kredi talep etmek için dokunun.
          </Link>
        )}
        {client.dmModuleAppointment && <HoursWarning clientId={client.id} basePath="/mesaj" href="/mesaj/randevular#calisma-kurallari" />}
      </div>
      <div className="pt-2">
        <ChatList conversations={conversations} filter={f ?? ""} />
      </div>
    </>
  );
}
