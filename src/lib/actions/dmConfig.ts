"use server";

// İşletme bilgileri, prompt (AI davranışı) sürümleri ve onayı, bilgi bankası, test kutusu, müşteri bazlı ayarlar.
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireDmActor } from "@/lib/dm/access";
import { buildSystemPrompt } from "@/lib/dm/prompt";
import { aiChat } from "@/lib/dm/ai";
import { runTool, toolsFor, type ToolContext } from "@/lib/dm/tools";
import "@/lib/dm/modules";
import { chargeUsage } from "@/lib/dm/credits";
import { getPricing } from "@/lib/dm/pricing";
import { dmAdminUrl, notifyDm } from "@/lib/dm/notify";
import { pageSubscription, subscribePage } from "@/lib/dm/metaDm";
import type { BusinessHours } from "@/lib/dm/hours";
import { BUSINESS_FIELDS } from "@/lib/dm/businessFields";

async function actorFor(clientId: string, opts: { adminOnly?: boolean; allowClient?: boolean } = { allowClient: true }) {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");
  return requireDmActor(session.user, clientId, opts);
}

const refresh = () => {
  revalidatePath("/mesaj-otomasyonu", "layout");
  revalidatePath("/panel/mesajlar");
  revalidatePath("/mesaj", "layout");
};


/** Pratik bilgiler müşteri değiştirince hemen geçerli olur (yeni sürüm). */
export async function saveBusinessInfo(
  clientId: string,
  input: { data: Record<string, string>; hours: BusinessHours | null; holiday: { on: boolean; message: string; until: string | null } }
) {
  const actor = await actorFor(clientId);
  const data: Record<string, string> = {};
  for (const f of BUSINESS_FIELDS) {
    const v = (input.data[f.key] ?? "").trim().slice(0, 5000);
    if (v) data[f.key] = v;
  }
  const hours: BusinessHours = {};
  for (const [d, slots] of Object.entries(input.hours ?? {})) {
    const ok = (slots ?? []).filter(([a, b]) => /^\d{2}:\d{2}$/.test(a) && /^\d{2}:\d{2}$/.test(b) && a < b);
    if (Number(d) >= 1 && Number(d) <= 7 && ok.length) hours[d] = ok;
  }
  const last = await prisma.dmBusinessInfo.findFirst({ where: { clientId }, orderBy: { version: "desc" } });
  await prisma.dmBusinessInfo.create({
    data: { clientId, version: (last?.version ?? 0) + 1, data: data as Prisma.InputJsonValue, createdById: actor.id, createdByName: actor.name },
  });
  const until = input.holiday.until ? new Date(`${input.holiday.until}T23:59:00+03:00`) : null;
  await prisma.dmConfig.upsert({
    where: { clientId },
    create: { clientId, businessHours: Object.keys(hours).length ? hours : undefined, holidayMode: input.holiday.on, holidayMessage: input.holiday.message.trim() || null, holidayUntil: until },
    update: { businessHours: Object.keys(hours).length ? hours : Prisma.DbNull, holidayMode: input.holiday.on, holidayMessage: input.holiday.message.trim() || null, holidayUntil: until },
  });
  refresh();
}


/** AI davranışı (prompt) değişikliği: admin kaydederse hemen yayına girer; müşteri ya da ekip üyesi önerirse admin onayına düşer. */
export async function proposePrompt(clientId: string, text: string, note?: string) {
  const actor = await actorFor(clientId);
  const body = text.trim();
  if (body.length < 10) throw new Error("Talimat metni çok kısa.");
  if (body.length > 20000) throw new Error("Talimat metni çok uzun (en fazla 20.000 karakter).");
  const isAdmin = actor.role === "ADMIN";
  const v = await prisma.dmPromptVersion.create({
    data: {
      clientId, text: body, note: note?.trim() || null,
      source: actor.role === "CLIENT" ? "CLIENT_EDIT" : "ADMIN_EDIT",
      status: isAdmin ? "APPROVED" : "PENDING",
      createdById: actor.id, createdByName: actor.name,
      ...(isAdmin ? { decidedById: actor.id, decidedByName: actor.name, decidedAt: new Date() } : {}),
    },
  });
  if (isAdmin) {
    await prisma.dmConfig.upsert({ where: { clientId }, create: { clientId, activePromptId: v.id }, update: { activePromptId: v.id } });
  } else {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
    await notifyDm({
      clientId, type: "DM_APPROVAL_PENDING", adminsOnly: true, staffUrl: dmAdminUrl(clientId, "isletme"),
      title: "Prompt değişikliği onay bekliyor", message: `${client?.name ?? "Müşteri"}: ${actor.name} AI talimatında değişiklik önerdi.`,
    });
  }
  refresh();
  return { approved: isAdmin };
}

export async function decidePrompt(versionId: string, approve: boolean) {
  const v = await prisma.dmPromptVersion.findUnique({ where: { id: versionId } });
  if (!v) throw new Error("Sürüm bulunamadı.");
  const actor = await actorFor(v.clientId, { adminOnly: true });
  if (v.status !== "PENDING") throw new Error("Bu sürüm zaten karara bağlanmış.");
  await prisma.dmPromptVersion.update({
    where: { id: v.id },
    data: { status: approve ? "APPROVED" : "REJECTED", decidedById: actor.id, decidedByName: actor.name, decidedAt: new Date() },
  });
  if (approve) await prisma.dmConfig.upsert({ where: { clientId: v.clientId }, create: { clientId: v.clientId, activePromptId: v.id }, update: { activePromptId: v.id } });
  refresh();
}

/** Eski (onaylı) bir sürüme dönüş. */
export async function activatePrompt(versionId: string) {
  const v = await prisma.dmPromptVersion.findUnique({ where: { id: versionId } });
  if (!v) throw new Error("Sürüm bulunamadı.");
  await actorFor(v.clientId, { adminOnly: true });
  if (v.status !== "APPROVED") throw new Error("Yalnızca onaylı bir sürüme dönülebilir.");
  await prisma.dmConfig.upsert({ where: { clientId: v.clientId }, create: { clientId: v.clientId, activePromptId: v.id }, update: { activePromptId: v.id } });
  refresh();
}

export async function saveKnowledgeItem(clientId: string, input: { id?: string; question: string; answer: string }) {
  const actor = await actorFor(clientId);
  const question = input.question.trim().slice(0, 1000);
  const answer = input.answer.trim().slice(0, 4000);
  if (!question || !answer) throw new Error("Soru ve cevap gerekli.");
  if (input.id) {
    const k = await prisma.dmKnowledgeItem.findFirst({ where: { id: input.id, clientId } });
    if (!k) throw new Error("Kayıt bulunamadı.");
    await prisma.dmKnowledgeItem.update({ where: { id: k.id }, data: { question, answer } });
  } else {
    await prisma.dmKnowledgeItem.create({ data: { clientId, question, answer, source: actor.role === "CLIENT" ? "OWNER_ANSWER" : "ADMIN", createdByName: actor.name } });
  }
  refresh();
}

export async function setKnowledgeActive(id: string, isActive: boolean) {
  const k = await prisma.dmKnowledgeItem.findUnique({ where: { id } });
  if (!k) throw new Error("Kayıt bulunamadı.");
  await actorFor(k.clientId);
  await prisma.dmKnowledgeItem.update({ where: { id }, data: { isActive } });
  refresh();
}

/** "Test et": örnek bir mesajla AI'ın nasıl cevap verdiğini dener. Gönderim yapılmaz; araçlar taklit edilir
 * (uygunluk / ürün arama gibi okuma araçları gerçekten çalışır). Admin ayarına göre kredi harcar. */
export async function testReply(clientId: string, message: string, draftPrompt?: string) {
  const actor = await actorFor(clientId);
  const text = message.trim();
  if (!text) throw new Error("Bir test mesajı yazın.");
  const [client, config] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { id: true, name: true, dmModuleAppointment: true, dmModuleProducts: true } }),
    prisma.dmConfig.findUnique({ where: { clientId } }),
  ]);
  let system = await buildSystemPrompt(clientId);
  if (draftPrompt?.trim()) system += `\n\n(TASLAK TALİMAT — test için):\n${draftPrompt.trim()}`;
  const available = toolsFor({ appointment: client.dmModuleAppointment, products: client.dmModuleProducts });
  const ctx: ToolContext = { clientId, clientName: client.name, conversationId: "test", contactId: "test" };
  const r = await aiChat(
    "text",
    config?.textModel,
    { system, turns: [{ role: "user", text }], tools: available.map((t) => t.def), executeTool: (call) => runTool(call, ctx, available, { dryRun: true }), maxOutputTokens: 1500 },
    { clientId, kind: "TEST" }
  );
  let credits = 0;
  if (config?.testSpendsCredit) {
    const pricing = await getPricing();
    const c = await chargeUsage({ clientId, cost: pricing.textCost, idempotencyKey: `test:${crypto.randomUUID()}`, note: `Test kutusu (${actor.name})` });
    credits = c.charged;
  }
  return { text: r.text || (r.refused ? "(Model bu mesaja cevap vermedi.)" : "(Boş cevap)"), toolCalls: r.toolCalls, model: r.ref, costUsd: r.costUsd, credits };
}

/** Admin: müşteri bazlı model / bekleme / takip / kredi ayarları. */
export async function saveClientDmSettings(clientId: string, formData: FormData) {
  await actorFor(clientId, { adminOnly: true });
  const str = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const int = (k: string, min: number, max: number) => {
    const n = Number(formData.get(k));
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Geçersiz değer: ${k} (${min}-${max})`);
    return n;
  };
  const hm = (k: string) => {
    const v = String(formData.get(k) ?? "");
    if (!/^\d{2}:\d{2}$/.test(v)) throw new Error(`Saat biçimi SS:DD olmalı: ${k}`);
    return v;
  };
  const neg = String(formData.get("negativeLimit") ?? "").trim();
  await prisma.dmConfig.upsert({
    where: { clientId },
    create: { clientId },
    update: {
      textModel: str("textModel"), mediaModel: str("mediaModel"), classifyModel: str("classifyModel"), setupModel: str("setupModel"),
      waitTextSec: int("waitTextSec", 1, 120), waitMediaSec: int("waitMediaSec", 1, 300), waitMaxSec: int("waitMaxSec", 5, 600),
      historyLimit: int("historyLimit", 5, 200),
      followUpEnabled: formData.get("followUpEnabled") === "on",
      followUpAutoApprove: formData.get("followUpAutoApprove") === "on",
      followUpSilenceMin: int("followUpSilenceMin", 30, 1440),
      followUpNotifyTime: hm("followUpNotifyTime"),
      followUpMorningStart: hm("followUpMorningStart"), followUpMorningEnd: hm("followUpMorningEnd"),
      followUpEveningStart: hm("followUpEveningStart"), followUpEveningEnd: hm("followUpEveningEnd"),
      quietStart: hm("quietStart"), quietEnd: hm("quietEnd"),
      appointmentDurationMin: int("appointmentDurationMin", 5, 600), appointmentGapMin: int("appointmentGapMin", 0, 240),
      negativeLimit: neg === "" ? null : int("negativeLimit", 0, 100),
      testSpendsCredit: formData.get("testSpendsCredit") === "on",
    },
  });
  refresh();
}

/** Admin: müşterinin Facebook sayfasını (ve bağlı Instagram hesabını) mesaj webhook'larına abone eder. */
export async function subscribeClientPage(clientId: string, pageId: string) {
  await actorFor(clientId, { adminOnly: true });
  const acc = await prisma.socialAccount.findFirst({ where: { pageId, clientId } });
  if (!acc) throw new Error("Bu sayfa bu müşteriye bağlı değil.");
  await subscribePage(pageId);
  return pageSubscription(pageId);
}
