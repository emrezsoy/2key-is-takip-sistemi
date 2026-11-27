// Gizli iCal takvim aboneliği: /api/dm/calendar/<token>.ics (Google Takvim → "URL ile ekle"). Giriş gerektirmez; token gizlidir.
import { prisma } from "@/lib/prisma";
import { buildIcs } from "@/lib/dm/appointments";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const token = file.replace(/\.ics$/i, "");
  if (token.length < 20) return new Response("Bulunamadı", { status: 404 });
  const config = await prisma.dmConfig.findUnique({ where: { calendarToken: token }, include: { client: { select: { name: true, dmManaged: true } } } });
  if (!config || !config.client.dmManaged) return new Response("Bulunamadı", { status: 404 });
  const list = await prisma.dmAppointment.findMany({
    where: { clientId: config.clientId, status: { in: ["CONFIRMED", "REQUESTED"] }, startAt: { gte: new Date(Date.now() - 30 * 864e5) } },
    orderBy: { startAt: "asc" },
    take: 1000,
  });
  return new Response(buildIcs(config.client.name, list), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": 'inline; filename="randevular.ics"' },
  });
}
