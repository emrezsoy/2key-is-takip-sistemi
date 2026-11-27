// Sesli kurulum akışı: görüşme (Realtime) → "son adım" dosyaları → analiz (Claude Sonnet) → admin onayı → canlı.
// Admin onaylamadan hiçbir şey canlıya geçmez.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { aiChat } from "../ai";
import type { AiMedia } from "../ai/types";
import { parseCsv, parseXlsx } from "../productImport";
import { enqueue } from "../queue";
import { dmAdminUrl, notifyDm } from "../notify";
import { ONBOARDING_CHECKLIST } from "./checklist";

const MAX_FILES_BYTES = 12 * 1024 * 1024;

type StoredFile = { name: string; mimeType: string; data: string };

export async function startOnboarding(clientId: string, input: { ownerName: string; businessName: string; byName: string }) {
  const open = await prisma.dmOnboardingSession.findFirst({ where: { clientId, status: { in: ["DRAFT", "IN_CALL", "UPLOADS", "ANALYZING", "PENDING_APPROVAL"] } } });
  if (open) return open;
  return prisma.dmOnboardingSession.create({
    data: { clientId, ownerName: input.ownerName.trim() || null, businessName: input.businessName.trim() || null, startedByName: input.byName, fields: {} },
  });
}

export async function saveOnboardingField(id: string, key: string, value: string) {
  const ob = await prisma.dmOnboardingSession.findUniqueOrThrow({ where: { id } });
  const fields = { ...((ob.fields ?? {}) as Record<string, string>) };
  const k = key.trim().slice(0, 60) || "diger";
  fields[k] = fields[k] && !fields[k].includes(value.trim()) ? `${fields[k]} | ${value.trim()}`.slice(0, 2000) : value.trim().slice(0, 2000);
  await prisma.dmOnboardingSession.update({ where: { id }, data: { fields } });
  const missing = ONBOARDING_CHECKLIST.filter((c) => c.required && !fields[c.key]).map((c) => c.key);
  return { saved: k, missingRequired: missing };
}

export async function finishOnboardingCall(id: string, transcript: { role: "assistant" | "user"; text: string }[], durationSec: number) {
  const ob = await prisma.dmOnboardingSession.findUniqueOrThrow({ where: { id } });
  const prev = (Array.isArray(ob.transcript) ? ob.transcript : []) as { role: string; text: string }[];
  await prisma.dmOnboardingSession.update({
    where: { id },
    data: {
      status: "UPLOADS",
      transcript: [...prev, ...transcript.map((t) => ({ role: t.role, text: t.text.slice(0, 4000) }))].slice(-400) as Prisma.InputJsonValue,
      durationSec: (ob.durationSec ?? 0) + Math.max(0, Math.round(durationSec)),
    },
  });
}

/** "Son adım": fiyat listesi, menü, ürün görselleri (görsel, PDF, Excel/CSV) + isteğe bağlı not → analiz kuyruğa girer. */
export async function submitOnboardingUploads(id: string, files: File[], note: string) {
  const ob = await prisma.dmOnboardingSession.findUniqueOrThrow({ where: { id } });
  if (!["UPLOADS", "IN_CALL", "DRAFT"].includes(ob.status)) throw new Error("Bu kurulum zaten analize gönderildi.");
  let total = 0;
  const stored: StoredFile[] = [];
  for (const f of files.slice(0, 10)) {
    total += f.size;
    if (total > MAX_FILES_BYTES) throw new Error("Dosyaların toplamı en fazla 12 MB olabilir.");
    const ok = /^image\/(png|jpeg|webp|gif)$/.test(f.type) || f.type === "application/pdf" || /\.(xlsx|csv)$/i.test(f.name);
    if (!ok) throw new Error(`Desteklenmeyen dosya: ${f.name} (görsel, PDF, Excel ya da CSV yükleyin)`);
    stored.push({ name: f.name, mimeType: f.type || "application/octet-stream", data: Buffer.from(await f.arrayBuffer()).toString("base64") });
  }
  const fields = { ...((ob.fields ?? {}) as Record<string, string>) };
  if (note.trim()) fields.ek_not = note.trim().slice(0, 4000);
  await prisma.dmOnboardingSession.update({ where: { id }, data: { status: "ANALYZING", files: stored as unknown as Prisma.InputJsonValue, fields } });
  await enqueue("ONBOARDING_ANALYSIS", { id }, { dedupeKey: `onboarding:${id}` });
}

const ANALYSIS_SYSTEM = `Bir ajansın, işletmenin Instagram/Facebook DM'lerini yanıtlayacak yapay zekâ asistanını kurmasına yardım ediyorsun.
Sesli görüşme dökümü, toplanan alanlar ve yüklenen dosyalardan (fiyat listesi, menü, ürün görselleri) işletmeyi çıkar.
Sadece JSON döndür:
{
 "profile": "işletmenin 4-6 cümlelik profili",
 "tone": "konuşma tarzı tespiti (hitap, resmiyet, emoji)",
 "suggestedModules": {"appointment": true/false, "products": true/false, "media": true/false},
 "businessInfo": {"Adres": "...", "Telefon": "...", "Web sitesi": "...", "Hizmetler ve fiyatlar": "...", "Kampanyalar": "...", "Ödeme yöntemleri": "...", "Kargo ve teslimat": "...", "İade ve değişim": "...", "Sık sorulanlar": "..."},
 "hours": {"1": [["09:00","18:00"]], ... (1=Pazartesi, bilinmiyorsa boş nesne)},
 "knowledge": [{"question": "...", "answer": "..."}],
 "promptDraft": "asistanın işletmeye özel talimatı: üslup, satış yaklaşımı, öncelikler, yapılmaması gerekenler, insana devir durumları (Türkçe, maddeler hâlinde değil düz paragraflar)"
}
Bilinmeyen alanları boş bırak; fiyat/bilgi uydurma.`;

/** ONBOARDING_ANALYSIS işi (worker). */
export async function runOnboardingAnalysis(id: string) {
  const ob = await prisma.dmOnboardingSession.findUnique({ where: { id }, include: { client: { select: { name: true } } } });
  if (!ob || ob.status !== "ANALYZING") return;
  const config = await prisma.dmConfig.findUnique({ where: { clientId: ob.clientId }, select: { setupModel: true } });
  const files = (Array.isArray(ob.files) ? ob.files : []) as unknown as StoredFile[];
  const media: AiMedia[] = [];
  const fileTexts: string[] = [];
  for (const f of files) {
    if (/\.(xlsx|csv)$/i.test(f.name)) {
      const buf = Buffer.from(f.data, "base64");
      const rows = /\.xlsx$/i.test(f.name) ? parseXlsx(new Uint8Array(buf)) : parseCsv(buf.toString("utf8"));
      fileTexts.push(`DOSYA ${f.name}:\n${rows.slice(0, 400).map((r) => r.join(" | ")).join("\n")}`);
    } else {
      media.push({ mimeType: f.mimeType, data: f.data });
    }
  }
  const transcript = ((Array.isArray(ob.transcript) ? ob.transcript : []) as { role: string; text: string }[])
    .map((t) => `${t.role === "user" ? "İşletme sahibi" : "Asistan"}: ${t.text}`)
    .join("\n");
  const r = await aiChat(
    "setup",
    config?.setupModel,
    {
      system: ANALYSIS_SYSTEM,
      json: true,
      maxOutputTokens: 8000,
      turns: [{
        role: "user",
        images: media,
        text: `İŞLETME: ${ob.businessName ?? ob.client.name} (sahibi: ${ob.ownerName ?? "—"})\n\nTOPLANAN ALANLAR:\n${JSON.stringify(ob.fields ?? {}, null, 1)}\n\nGÖRÜŞME DÖKÜMÜ:\n${transcript || "(döküm yok)"}\n\n${fileTexts.join("\n\n")}`,
      }],
    },
    { clientId: ob.clientId, kind: "ONBOARDING" }
  );
  let analysis: Record<string, unknown>;
  try {
    analysis = JSON.parse(r.text.replace(/^```(json)?/m, "").replace(/```\s*$/m, "").trim());
  } catch {
    throw new Error("Analiz çıktısı okunamadı; tekrar denenecek.");
  }
  await prisma.dmOnboardingSession.update({
    where: { id },
    data: { status: "PENDING_APPROVAL", analysis: analysis as Prisma.InputJsonValue, promptDraft: typeof analysis.promptDraft === "string" ? analysis.promptDraft : null, files: [] },
  });
  await notifyDm({
    clientId: ob.clientId, type: "DM_APPROVAL_PENDING", adminsOnly: true, staffUrl: dmAdminUrl(ob.clientId, "isletme"),
    title: "Kurulum çıktısı onay bekliyor", message: `${ob.client.name}: sesli kurulum analizi hazır; onaylanınca canlıya geçer.`,
  });
}

/** Admin onayı: prompt yayına girer, işletme bilgileri / saatler / bilgi bankası ve (seçildiyse) modüller uygulanır. */
export async function approveOnboarding(id: string, input: { promptText: string; applyModules: boolean; byId: string; byName: string }) {
  const ob = await prisma.dmOnboardingSession.findUniqueOrThrow({ where: { id } });
  if (ob.status !== "PENDING_APPROVAL") throw new Error("Bu kurulum onay beklemiyor.");
  const a = (ob.analysis ?? {}) as {
    businessInfo?: Record<string, string>; hours?: Record<string, [string, string][]>; knowledge?: { question: string; answer: string }[];
    suggestedModules?: { appointment?: boolean; products?: boolean; media?: boolean };
  };
  const now = new Date();
  const prompt = await prisma.dmPromptVersion.create({
    data: { clientId: ob.clientId, text: input.promptText.trim(), source: "ONBOARDING", status: "APPROVED", createdByName: "Sesli kurulum", decidedById: input.byId, decidedByName: input.byName, decidedAt: now },
  });
  const info = Object.fromEntries(Object.entries(a.businessInfo ?? {}).filter(([, v]) => typeof v === "string" && v.trim()));
  if (Object.keys(info).length) {
    const last = await prisma.dmBusinessInfo.findFirst({ where: { clientId: ob.clientId }, orderBy: { version: "desc" } });
    await prisma.dmBusinessInfo.create({ data: { clientId: ob.clientId, version: (last?.version ?? 0) + 1, data: info, createdByName: "Sesli kurulum" } });
  }
  const hours = a.hours && Object.keys(a.hours).length ? a.hours : undefined;
  await prisma.dmConfig.upsert({
    where: { clientId: ob.clientId },
    create: { clientId: ob.clientId, activePromptId: prompt.id, ...(hours ? { businessHours: hours } : {}) },
    update: { activePromptId: prompt.id, ...(hours ? { businessHours: hours } : {}) },
  });
  for (const k of (a.knowledge ?? []).slice(0, 100)) {
    if (k?.question && k?.answer) await prisma.dmKnowledgeItem.create({ data: { clientId: ob.clientId, question: k.question.slice(0, 1000), answer: k.answer.slice(0, 4000), source: "ONBOARDING", createdByName: "Sesli kurulum" } });
  }
  if (input.applyModules && a.suggestedModules) {
    await prisma.client.update({
      where: { id: ob.clientId },
      data: { dmModuleAppointment: !!a.suggestedModules.appointment, dmModuleProducts: !!a.suggestedModules.products, dmModuleMedia: a.suggestedModules.media !== false },
    });
  }
  await prisma.dmOnboardingSession.update({ where: { id }, data: { status: "APPROVED", promptDraft: input.promptText, decidedByName: input.byName, decidedAt: now } });
}

export async function rejectOnboarding(id: string, byName: string) {
  await prisma.dmOnboardingSession.update({ where: { id }, data: { status: "REJECTED", decidedByName: byName, decidedAt: new Date() } });
}
