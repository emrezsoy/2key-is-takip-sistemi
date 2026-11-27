// Geliştirme yardımcısı: bir müşterinin Mesaj Otomasyonu durumunu yazdırır (konuşmalar, son mesajlar, kredi, kuyruk).
// Kullanım: npm run dm:state -- "Cafe Nero"
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true);

async function main() {
  const { prisma } = await import("@/lib/prisma");
  const { getBalance } = await import("@/lib/dm/credits");
  const name = process.argv[2];
  const client = await prisma.client.findFirst({ where: name ? { OR: [{ name }, { id: name }] } : { dmManaged: true } });
  if (!client) throw new Error("Müşteri bulunamadı.");
  console.log(`== ${client.name} · bakiye ${JSON.stringify(await getBalance(client.id))}`);
  const convs = await prisma.dmConversation.findMany({ where: { clientId: client.id }, include: { contact: true, messages: { orderBy: { createdAt: "asc" } } } });
  for (const c of convs) {
    console.log(`-- ${c.channel} ${c.contact.externalId} · mod ${c.mode}${c.waitingHuman ? " · insan bekliyor" : ""}${c.handoffReason ? ` (${c.handoffReason})` : ""}`);
    for (const m of c.messages.slice(-8)) {
      console.log(`   ${m.direction === "IN" ? "←" : "→"} [${m.sender}${m.status !== "SENT" ? `/${m.status}` : ""}${m.creditCost ? ` -${m.creditCost}kr` : ""}] ${(m.text ?? "").replace(/\s+/g, " ").slice(0, 140)}`);
    }
  }
  const jobs = await prisma.dmJob.groupBy({ by: ["type", "status"], _count: { _all: true } });
  console.log("kuyruk:", jobs.map((j) => `${j.type}/${j.status}=${j._count._all}`).join(", "));
  const failed = await prisma.dmJob.findMany({ where: { status: "FAILED" }, orderBy: { updatedAt: "desc" }, take: 3, select: { type: true, lastError: true } });
  if (failed.length) console.log("son hatalar:", failed);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
