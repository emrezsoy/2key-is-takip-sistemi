// AI'ın çağırabildiği araçlar. Temel araçlar her zaman; randevu ve ürün araçları modül açıksa (kendi dosyalarında kaydolur).
import { prisma } from "@/lib/prisma";
import type { AiToolCall, AiToolDef } from "./ai/types";
import { notifyDm } from "./notify";
import { publishDmEvent } from "./events";

export type ToolContext = {
  clientId: string;
  clientName: string;
  conversationId: string;
  contactId: string;
  /** Araçların motora bildirdiği sonuçlar. */
  handoff?: string;
  askedOwner?: boolean;
  hotLead?: string;
  appointmentRequested?: boolean;
  /** "Test et" kutusu: salt okunur araçlar çalışır ama bildirim gönderilmez. */
  dryRun?: boolean;
};

type ToolImpl = {
  def: AiToolDef;
  module?: "appointment" | "products";
  /** Yalnızca okur (uygunluk, ürün arama): "Test et" kutusunda gerçekten çalışır; diğerleri test modunda taklit edilir. */
  readOnly?: boolean;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
};

const s = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const tools: ToolImpl[] = [
  {
    def: {
      name: "ask_owner",
      description: "Bilmediğin ya da emin olmadığın bir soruyu işletme sahibine iletir. Sahibin cevabı gelince kişiye iletilir.",
      parameters: { type: "object", properties: { question: { type: "string", description: "İşletme sahibine sorulacak, kişinin sorusunu özetleyen net soru" } }, required: ["question"] },
    },
    async run(args, ctx) {
      const question = s(args.question, 1000);
      if (!question) return "Soru boş olamaz.";
      const open = await prisma.dmOwnerQuestion.findFirst({ where: { conversationId: ctx.conversationId, status: "PENDING" } });
      if (!open) {
        await prisma.dmOwnerQuestion.create({ data: { clientId: ctx.clientId, conversationId: ctx.conversationId, question } });
        await notifyDm({
          clientId: ctx.clientId, type: "DM_AI_QUESTION", toClient: true, fallbackToStaff: true,
          title: "AI bir soru soruyor", message: `${ctx.clientName}: "${question.slice(0, 160)}" — cevabınız müşteriye iletilecek.`,
        });
        await publishDmEvent({ clientId: ctx.clientId, conversationId: ctx.conversationId, kind: "pending" });
      }
      ctx.askedOwner = true;
      return "Soru işletme sahibine iletildi. Kişiye kısa bir mesajla kontrol edip döneceğini söyle; cevabı tahmin etme.";
    },
  },
  {
    def: {
      name: "handoff_to_human",
      description: "Konuşmayı işletmenin ekibine devreder (şikâyet, hassas konu, insan isteği, kişisel sohbet, cevaplanamayan durum). Sonrasında AI bu konuşmaya cevap vermez.",
      parameters: { type: "object", properties: { reason: { type: "string", description: "Kısa devir sebebi" } }, required: ["reason"] },
    },
    async run(args, ctx) {
      ctx.handoff = s(args.reason, 200) || "AI devretti";
      return "Konuşma ekibe devredilecek. Kişiye kısa ve nazik bir mesajla ekibin en kısa sürede döneceğini söyle (kişisel sohbetse hiçbir şey yazma ve boş cevap ver).";
    },
  },
  {
    def: {
      name: "save_contact_info",
      description: "Kişinin verdiği ad, telefon ya da e-posta bilgisini kaydeder.",
      parameters: { type: "object", properties: { name: { type: "string" }, phone: { type: "string" }, email: { type: "string" } } },
    },
    async run(args, ctx) {
      const data: { name?: string; phone?: string; email?: string } = {};
      if (s(args.name)) data.name = s(args.name, 120);
      if (s(args.phone)) data.phone = s(args.phone, 40);
      if (s(args.email)) data.email = s(args.email, 160);
      if (Object.keys(data).length === 0) return "Kaydedilecek bilgi yok.";
      await prisma.dmContact.update({ where: { id: ctx.contactId }, data });
      return "Kaydedildi.";
    },
  },
  {
    def: {
      name: "mark_hot_lead",
      description: "Satın almaya çok yakın (sıcak) müşteriyi işletmeye bildirir.",
      parameters: { type: "object", properties: { summary: { type: "string", description: "Kişinin ne istediğinin kısa özeti" } }, required: ["summary"] },
    },
    async run(args, ctx) {
      ctx.hotLead = s(args.summary, 400) || "Sıcak müşteri";
      return "İşletmeye bildirildi. Kişiyle konuşmaya normal şekilde devam et.";
    },
  },
];

export function registerTool(t: ToolImpl) {
  if (!tools.some((x) => x.def.name === t.def.name)) tools.push(t);
}

export function toolsFor(modules: { appointment: boolean; products: boolean }) {
  return tools.filter((t) => !t.module || (t.module === "appointment" && modules.appointment) || (t.module === "products" && modules.products));
}

export async function runTool(call: AiToolCall, ctx: ToolContext, available: ToolImpl[], opts: { dryRun?: boolean } = {}): Promise<string> {
  const t = available.find((x) => x.def.name === call.name);
  if (!t) return `Bilinmeyen araç: ${call.name}`;
  if (opts.dryRun && !t.readOnly) {
    if (call.name === "ask_owner") return "(Test) Soru işletme sahibine iletilmiş sayılır. Kişiye kontrol edip döneceğini söyle.";
    if (call.name === "handoff_to_human") return "(Test) Konuşma ekibe devredilmiş sayılır. Kişiye ekibin döneceğini söyle.";
    return `(Test) ${call.name} çalıştırılmış sayılır.`;
  }
  return t.run(call.args ?? {}, opts.dryRun ? { ...ctx, dryRun: true } : ctx);
}
