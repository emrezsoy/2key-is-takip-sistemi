import { notFound } from "next/navigation";
import { requirePortalUser } from "@/lib/clientPortal";
import { loadConversation } from "@/lib/dm/workspace";
import { ChatView } from "@/components/dm/app/ChatView";

export const metadata = { title: "Sohbet" };

export default async function DmChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePortalUser();
  const c = await loadConversation(user.clientId, id);
  if (!c) notFound();
  return <ChatView key={c.id} c={c} />;
}
