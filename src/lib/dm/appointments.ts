// Randevu modülü: uygunluk (kod hesaplar), AI talebi → işletme onayı (onay / ret / alternatif) → kişiye mesaj.
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { addDays, computeSlots, fmtTr, isSlotFree, localDay, localToDate, type Interval } from "./availability";
import { registerTool, type ToolContext } from "./tools";
import { notifyDm } from "./notify";
import { publishDmEvent } from "./events";
import { aiChat } from "./ai";
import { buildSystemPrompt } from "./prompt";
import { sendToConversation, WindowClosedError } from "./send";
import { windowOpen } from "./batching";
import { chargeUsage } from "./credits";
import { getPricing } from "./pricing";

async function scheduleInput(clientId: string, excludeId?: string) {
  const [config, rules, busy] = await Promise.all([
    prisma.dmConfig.findUnique({ where: { clientId } }),
    prisma.dmAvailabilityRule.findMany({ where: { clientId } }),
    prisma.dmAppointment.findMany({
      where: { clientId, status: { in: ["REQUESTED", "CONFIRMED", "RESCHEDULE_PROPOSED"] }, endAt: { gt: new Date() }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { startAt: true, endAt: true, status: true, proposedStartAt: true, proposedEndAt: true },
    }),
  ]);
  const busyIntervals: Interval[] = busy.map((b) =>
    b.status === "RESCHEDULE_PROPOSED" && b.proposedStartAt && b.proposedEndAt ? { start: b.proposedStartAt, end: b.proposedEndAt } : { start: b.startAt, end: b.endAt }
  );
  return {
    weekly: rules.filter((r) => r.kind === "WEEKLY_OPEN" && r.weekday && r.startTime && r.endTime).map((r) => ({ weekday: r.weekday!, startTime: r.startTime!, endTime: r.endTime! })),
    closed: rules.filter((r) => r.kind === "CLOSED_RANGE" && r.startAt && r.endAt).map((r) => ({ start: r.startAt!, end: r.endAt! })),
    busy: busyIntervals,
    durationMin: config?.appointmentDurationMin ?? 60,
    gapMin: config?.appointmentGapMin ?? 0,
  };
}

/** Çalışma saati girilmemiş: AI randevu oluşturamaz. İşletmeye (konuşma başına 6 saatte bir) bildirim gider. */
const noHoursNotified = new Map<string, number>();
const NO_HOURS_REPLY =
  "İşletme henüz çalışma saatlerini sisteme girmediği için randevu oluşturulamıyor ve uygun saat bilinmiyor. İşletmeye bildirim gönderildi. " +
  "Kişiden istediği gün/saati ve adını, telefonunu al (save_contact_info), işletmenin kendisine dönüp randevuyu netleştireceğini söyle. " +
  "Saat önerme, randevuyu onaylama, ask_owner ile tekrar sorma.";

async function notifyNoHours(ctx: ToolContext, detail?: string) {
  ctx.appointmentRequested = true;
  const last = noHoursNotified.get(ctx.conversationId) ?? 0;
  if (Date.now() - last < 6 * 3600_000) return;
  noHoursNotified.set(ctx.conversationId, Date.now());
  const conv = await prisma.dmConversation.findUnique({ where: { id: ctx.conversationId }, include: { contact: true } });
  const who = conv?.contact.name ?? conv?.contact.username ?? "Bir kişi";
  await notifyDm({
    clientId: ctx.clientId, type: "DM_APPOINTMENT_REQUEST", toClient: true, fallbackToStaff: true,
    title: "Randevu talebi var: çalışma saatleri eksik",
    message: `${ctx.clientName}: ${who}${detail ? ` ${detail} için` : ""} randevu istiyor, ancak çalışma saatlerinizi girmediğiniz için randevuyu oluşturamıyorum. Mesajlar → Randevular → Çalışma kuralları'ndan saatlerinizi girin; bu kişiye siz dönüş yapın.`,
  });
  await publishDmEvent({ clientId: ctx.clientId, conversationId: ctx.conversationId, kind: "conversation" });
}

const hasWorkingHours = async (clientId: string) => (await prisma.dmAvailabilityRule.count({ where: { clientId, kind: "WEEKLY_OPEN" } })) > 0;

export async function availableSlots(clientId: string, fromDate: string, days: number, max = 40) {
  const input = await scheduleInput(clientId);
  return computeSlots({ ...input, fromDate, days, now: new Date(), maxSlots: max });
}

const today = () => localDay(new Date()).date;

/** "YYYY-MM-DD HH:MM" ya da ISO → Date (İstanbul). */
export function parseLocal(v: string): Date | null {
  const s = v.trim();
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(s);
  if (m) return localToDate(m[1], m[2]);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

registerTool({
  module: "appointment",
  readOnly: true,
  def: {
    name: "check_availability",
    description: "Randevu için uygun saatleri listeler. Tarih verilmezse bugünden itibaren bakar.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Başlangıç günü YYYY-MM-DD (İstanbul)" },
        days: { type: "number", description: "Kaç gün ileriye bakılsın (1-14)" },
      },
    },
  },
  async run(args, ctx) {
    if (!(await hasWorkingHours(ctx.clientId))) {
      if (!ctx.dryRun) await notifyNoHours(ctx);
      return NO_HOURS_REPLY;
    }
    const from = typeof args.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.date) ? args.date : today();
    const days = Math.min(14, Math.max(1, Number(args.days) || 3));
    const slots = await availableSlots(ctx.clientId, from < today() ? today() : from, days, 30);
    if (!slots.length) return `${from} tarihinden itibaren ${days} gün içinde uygun saat yok. Başka tarih öner ya da sor.`;
    const byDay = new Map<string, string[]>();
    for (const s of slots) {
      const d = localDay(s).date;
      const label = new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Istanbul" }).format(s);
      const key = `${d} (${label})`;
      byDay.set(key, [...(byDay.get(key) ?? []), new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }).format(s)]);
    }
    return `Uygun saatler (İstanbul): ${[...byDay].map(([d, hs]) => `${d}: ${hs.join(", ")}`).join("; ")}. request_appointment için start "YYYY-MM-DD HH:MM" biçiminde verilmeli.`;
  },
});

registerTool({
  module: "appointment",
  def: {
    name: "request_appointment",
    description: "Kişiyle netleştirilen saat için randevu talebi oluşturur (işletme onayından sonra kesinleşir).",
    parameters: {
      type: "object",
      properties: {
        start: { type: "string", description: "Başlangıç 'YYYY-MM-DD HH:MM' (İstanbul)" },
        name: { type: "string" },
        phone: { type: "string" },
        service: { type: "string", description: "İstenen hizmet" },
        note: { type: "string" },
      },
      required: ["start"],
    },
  },
  async run(args, ctx) {
    const start = parseLocal(String(args.start ?? ""));
    if (!(await hasWorkingHours(ctx.clientId))) {
      await notifyNoHours(ctx, start ? fmtTr(start) : undefined);
      return NO_HOURS_REPLY;
    }
    if (!start) return "Geçersiz tarih/saat. 'YYYY-MM-DD HH:MM' biçiminde ver.";
    const input = await scheduleInput(ctx.clientId);
    if (!isSlotFree(start, { ...input, now: new Date() })) return "Bu saat uygun değil. check_availability ile uygun saatleri tekrar kontrol et.";
    const end = new Date(start.getTime() + input.durationMin * 60_000);
    const conv = await prisma.dmConversation.findUnique({ where: { id: ctx.conversationId }, include: { contact: true } });
    const name = typeof args.name === "string" && args.name.trim() ? args.name.trim().slice(0, 120) : conv?.contact.name ?? null;
    const phone = typeof args.phone === "string" && args.phone.trim() ? args.phone.trim().slice(0, 40) : conv?.contact.phone ?? null;
    await prisma.dmAppointment.create({
      data: {
        clientId: ctx.clientId, contactId: ctx.contactId, conversationId: ctx.conversationId, startAt: start, endAt: end, source: "AI",
        customerName: name, customerPhone: phone,
        service: typeof args.service === "string" ? args.service.slice(0, 200) : null,
        note: typeof args.note === "string" ? args.note.slice(0, 500) : null,
      },
    });
    if (name || phone) await prisma.dmContact.update({ where: { id: ctx.contactId }, data: { ...(name ? { name } : {}), ...(phone ? { phone } : {}) } });
    ctx.appointmentRequested = true;
    await notifyDm({
      clientId: ctx.clientId, type: "DM_APPOINTMENT_REQUEST", toClient: true, fallbackToStaff: true,
      title: "Yeni randevu talebi", message: `${ctx.clientName}: ${name ?? "Bir kişi"} · ${fmtTr(start)}. Onaylamak için Mesajlar → Bekleyen işler.`,
    });
    await publishDmEvent({ clientId: ctx.clientId, conversationId: ctx.conversationId, kind: "pending" });
    return `Talep oluşturuldu: ${fmtTr(start)}. Kişiye talebin alındığını, işletme onaylayınca bildirileceğini söyle.`;
  },
});

registerTool({
  module: "appointment",
  def: {
    name: "accept_proposed_appointment",
    description: "İşletmenin önerdiği alternatif randevu saatini kişi kabul ettiğinde çağır; randevu kesinleşir.",
    parameters: { type: "object", properties: {} },
  },
  async run(_args, ctx: ToolContext) {
    const a = await prisma.dmAppointment.findFirst({ where: { conversationId: ctx.conversationId, status: "RESCHEDULE_PROPOSED" }, orderBy: { updatedAt: "desc" } });
    if (!a || !a.proposedStartAt || !a.proposedEndAt) return "Bu kişiye önerilmiş bir alternatif randevu yok.";
    await prisma.dmAppointment.update({
      where: { id: a.id },
      data: { status: "CONFIRMED", startAt: a.proposedStartAt, endAt: a.proposedEndAt, proposedStartAt: null, proposedEndAt: null, decidedAt: new Date() },
    });
    await notifyDm({ clientId: ctx.clientId, type: "DM_APPOINTMENT_REQUEST", toClient: true, fallbackToStaff: true, title: "Randevu kesinleşti", message: `${ctx.clientName}: ${a.customerName ?? "Kişi"} önerdiğiniz ${fmtTr(a.proposedStartAt)} saatini kabul etti.` });
    await publishDmEvent({ clientId: ctx.clientId, conversationId: ctx.conversationId, kind: "pending" });
    return `Randevu kesinleşti: ${fmtTr(a.proposedStartAt)}. Kişiye onay mesajı yaz.`;
  },
});

const activeAppointment = (conversationId: string) =>
  prisma.dmAppointment.findFirst({
    where: { conversationId, status: { in: ["REQUESTED", "CONFIRMED", "RESCHEDULE_PROPOSED"] }, endAt: { gt: new Date() } },
    orderBy: { startAt: "asc" },
  });

registerTool({
  module: "appointment",
  def: {
    name: "reschedule_appointment",
    description: "Kişi mevcut randevusunun saatini değiştirmek isterse yeni saat için değişiklik talebi oluşturur (işletme onaylayınca kesinleşir). Randevu değişikliği için ask_owner kullanma.",
    parameters: {
      type: "object",
      properties: { start: { type: "string", description: "Yeni başlangıç 'YYYY-MM-DD HH:MM' (İstanbul)" }, note: { type: "string" } },
      required: ["start"],
    },
  },
  async run(args, ctx) {
    const a = await activeAppointment(ctx.conversationId);
    if (!a) return "Bu kişinin değiştirilecek bir randevusu yok. Yeni randevu için request_appointment kullan.";
    const start = parseLocal(String(args.start ?? ""));
    if (!start) return "Geçersiz tarih/saat. 'YYYY-MM-DD HH:MM' biçiminde ver.";
    if (!(await hasWorkingHours(ctx.clientId))) {
      await notifyNoHours(ctx, fmtTr(start));
      return NO_HOURS_REPLY;
    }
    const input = await scheduleInput(ctx.clientId, a.id);
    if (!isSlotFree(start, { ...input, now: new Date() })) return "Bu saat uygun değil. check_availability ile uygun saatleri kontrol edip kişiye sor.";
    const old = a.status === "RESCHEDULE_PROPOSED" && a.proposedStartAt ? a.proposedStartAt : a.startAt;
    const note = [`Saat değişikliği talebi (eski: ${fmtTr(old)})`, typeof args.note === "string" ? args.note.slice(0, 300) : "", a.note ?? ""].filter(Boolean).join(" · ").slice(0, 500);
    await prisma.dmAppointment.update({
      where: { id: a.id },
      data: { startAt: start, endAt: new Date(start.getTime() + input.durationMin * 60_000), status: "REQUESTED", proposedStartAt: null, proposedEndAt: null, decidedAt: null, decidedByName: null, note },
    });
    ctx.appointmentRequested = true;
    await notifyDm({
      clientId: ctx.clientId, type: "DM_APPOINTMENT_REQUEST", toClient: true, fallbackToStaff: true,
      title: "Randevu saat değişikliği talebi",
      message: `${ctx.clientName}: ${a.customerName ?? "Bir kişi"} randevusunu ${fmtTr(old)} yerine ${fmtTr(start)} olarak değiştirmek istiyor. Onaylamak için Bekleyen işler.`,
    });
    await publishDmEvent({ clientId: ctx.clientId, conversationId: ctx.conversationId, kind: "pending" });
    return `Değişiklik talebi oluşturuldu: ${fmtTr(start)}. Kişiye talebin alındığını, işletme onaylayınca bildirileceğini söyle.`;
  },
});

registerTool({
  module: "appointment",
  def: {
    name: "cancel_appointment",
    description: "Kişi randevusunu iptal etmek istediğini açıkça söylerse randevuyu iptal eder ve işletmeye bildirir.",
    parameters: { type: "object", properties: { reason: { type: "string" } } },
  },
  async run(args, ctx) {
    const a = await activeAppointment(ctx.conversationId);
    if (!a) return "Bu kişinin iptal edilecek bir randevusu yok.";
    await prisma.dmAppointment.update({ where: { id: a.id }, data: { status: "CANCELLED", decidedAt: new Date(), decidedByName: "Kişi (mesajla)" } });
    await notifyDm({
      clientId: ctx.clientId, type: "DM_APPOINTMENT_REQUEST", toClient: true, fallbackToStaff: true,
      title: "Randevu iptal edildi",
      message: `${ctx.clientName}: ${a.customerName ?? "Bir kişi"} ${fmtTr(a.startAt)} randevusunu iptal etti${typeof args.reason === "string" && args.reason.trim() ? ` (${args.reason.trim().slice(0, 120)})` : ""}.`,
    });
    await publishDmEvent({ clientId: ctx.clientId, conversationId: ctx.conversationId, kind: "pending" });
    return `Randevu iptal edildi (${fmtTr(a.startAt)}). Kişiye kısa bir onay mesajı yaz.`;
  },
});

/** Konuşmaya ait bekleyen / önerilmiş randevu bilgisi (AI talimatına eklenir). */
export async function appointmentContext(conversationId: string): Promise<string> {
  const list = await prisma.dmAppointment.findMany({ where: { conversationId, status: { in: ["REQUESTED", "RESCHEDULE_PROPOSED", "CONFIRMED"] }, endAt: { gt: new Date() } } });
  if (!list.length) return "";
  return `BU KİŞİNİN RANDEVULARI: ${list
    .map((a) =>
      a.status === "RESCHEDULE_PROPOSED" && a.proposedStartAt
        ? `işletme ${fmtTr(a.proposedStartAt)} saatini önerdi, kişinin cevabı bekleniyor (kabul ederse accept_proposed_appointment)`
        : a.status === "REQUESTED"
          ? `${fmtTr(a.startAt)} için talep işletme onayı bekliyor`
          : `${fmtTr(a.startAt)} onaylı`
    )
    .join("; ")}. Kişi saati değiştirmek isterse reschedule_appointment, iptal etmek isterse cancel_appointment kullan; bunlar için ask_owner kullanma.`;
}

/** İşletme kararı: onay / ret / alternatif öneri → kişiye mesaj (SEND_APPOINTMENT_UPDATE). */
export async function decideAppointment(id: string, decision: "CONFIRM" | "REJECT" | "PROPOSE", byName: string, proposed?: Date) {
  const a = await prisma.dmAppointment.findUnique({ where: { id } });
  if (!a) throw new Error("Randevu bulunamadı.");
  if (decision === "PROPOSE") {
    if (!proposed) throw new Error("Önerilecek tarihi seçin.");
    const input = await scheduleInput(a.clientId, a.id);
    if (!isSlotFree(proposed, { ...input, now: new Date(), leadMin: 0 })) throw new Error("Seçtiğiniz saat çalışma saatleri / diğer randevularla çakışıyor.");
    await prisma.dmAppointment.update({
      where: { id },
      data: { status: "RESCHEDULE_PROPOSED", proposedStartAt: proposed, proposedEndAt: new Date(proposed.getTime() + input.durationMin * 60_000), decidedByName: byName, decidedAt: new Date() },
    });
  } else {
    await prisma.dmAppointment.update({ where: { id }, data: { status: decision === "CONFIRM" ? "CONFIRMED" : "REJECTED", decidedByName: byName, decidedAt: new Date() } });
  }
  if (a.conversationId) {
    const { enqueue } = await import("./queue");
    await enqueue("SEND_APPOINTMENT_UPDATE", { appointmentId: id, decision });
  }
  return a.conversationId
    ? (await prisma.dmConversation.findUnique({ where: { id: a.conversationId }, select: { lastUserMessageAt: true } }))?.lastUserMessageAt
    : null;
}

const DECISION_TEXT = {
  CONFIRM: (a: { startAt: Date }) => `İşletme ${fmtTr(a.startAt)} randevusunu ONAYLADI. Kişiye kısa bir onay mesajı yaz (tarih/saat ve gerekiyorsa adres).`,
  REJECT: () => `İşletme bu randevu talebini uygun görmedi (RET). Kişiden nazikçe özür dile; neden sorulursa "işletme bu saati uygun görmedi" de, gerekirse başka zaman önermeyi teklif et.`,
  PROPOSE: (a: { proposedStartAt: Date | null }) => `İşletme talep edilen saat yerine ${a.proposedStartAt ? fmtTr(a.proposedStartAt) : "başka bir saat"} önerdi. Kişiye bu alternatifi sor; kabul ederse accept_proposed_appointment çağrılacak.`,
};

/** SEND_APPOINTMENT_UPDATE işi. Pencere kapandıysa gönderilemez (panelde görünür). */
export async function sendAppointmentUpdate(appointmentId: string, decision: keyof typeof DECISION_TEXT) {
  const a = await prisma.dmAppointment.findUnique({ where: { id: appointmentId } });
  if (!a?.conversationId) return;
  const conv = await prisma.dmConversation.findUnique({ where: { id: a.conversationId } });
  if (!conv || !windowOpen(conv.lastUserMessageAt, new Date())) return;
  const config = await prisma.dmConfig.findUnique({ where: { clientId: a.clientId } });
  const system = await buildSystemPrompt(a.clientId);
  const r = await aiChat(
    "text",
    config?.textModel,
    { system, turns: [{ role: "user", text: `[İşletmeden bilgi] ${DECISION_TEXT[decision](a)}` }], maxOutputTokens: 500 },
    { clientId: a.clientId, kind: "TEXT_REPLY" }
  );
  if (!r.text.trim()) return;
  try {
    const sent = await sendToConversation({
      conversationId: conv.id, text: r.text.trim(), sender: "AI",
      ai: { model: r.ref, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, costUsd: r.costUsd },
    });
    const pricing = await getPricing();
    const charge = await chargeUsage({ clientId: a.clientId, cost: pricing.textCost, idempotencyKey: `appt:${a.id}:${decision}:${crypto.randomUUID().slice(0, 8)}`, conversationId: conv.id, messageId: sent.id, note: "Randevu bildirimi" });
    await prisma.dmMessage.update({ where: { id: sent.id }, data: { creditCost: charge.charged } });
  } catch (e) {
    if (e instanceof WindowClosedError) return;
    throw e;
  }
}

export async function createManualAppointment(clientId: string, input: { start: Date; durationMin?: number; name: string; phone?: string; service?: string; note?: string; byName: string }) {
  const config = await prisma.dmConfig.findUnique({ where: { clientId } });
  const dur = input.durationMin ?? config?.appointmentDurationMin ?? 60;
  await prisma.dmAppointment.create({
    data: {
      clientId, startAt: input.start, endAt: new Date(input.start.getTime() + dur * 60_000), status: "CONFIRMED", source: "MANUAL",
      customerName: input.name || null, customerPhone: input.phone || null, service: input.service || null, note: input.note || null,
      decidedByName: input.byName, decidedAt: new Date(),
    },
  });
}

export async function upcomingAppointments(clientId: string, fromDate = today(), days = 30) {
  return prisma.dmAppointment.findMany({
    where: { clientId, status: { in: ["REQUESTED", "CONFIRMED", "RESCHEDULE_PROPOSED"] }, startAt: { gte: localToDate(fromDate, "00:00"), lt: localToDate(addDays(fromDate, days), "00:00") } },
    orderBy: { startAt: "asc" },
  });
}

/** Google Takvim "etkinlik ekle" bağlantısı (OAuth gerektirmez). */
export function googleCalendarLink(a: { startAt: Date; endAt: Date; customerName: string | null; service: string | null; customerPhone: string | null; note: string | null }, clientName: string) {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `Randevu: ${a.customerName ?? "Müşteri"}${a.service ? ` (${a.service})` : ""}`,
    dates: `${f(a.startAt)}/${f(a.endAt)}`,
    details: [clientName, a.customerPhone, a.note].filter(Boolean).join("\n"),
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** iCal (ICS) metni: Google Takvim'e "URL ile ekle" için. */
export function buildIcs(clientName: string, list: { id: string; startAt: Date; endAt: Date; status: string; customerName: string | null; service: string | null; customerPhone: string | null }[]) {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const events = list.map((a) =>
    [
      "BEGIN:VEVENT",
      `UID:${a.id}@2keyidea-dm`,
      `DTSTAMP:${f(new Date())}`,
      `DTSTART:${f(a.startAt)}`,
      `DTEND:${f(a.endAt)}`,
      `SUMMARY:${esc(`${a.status === "CONFIRMED" ? "" : "(Onay bekliyor) "}Randevu: ${a.customerName ?? "Müşteri"}${a.service ? ` - ${a.service}` : ""}`)}`,
      a.customerPhone ? `DESCRIPTION:${esc(`Tel: ${a.customerPhone}`)}` : "",
      "END:VEVENT",
    ].filter(Boolean).join("\r\n")
  );
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//2 Key Idea//Mesaj Otomasyonu//TR", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(`${clientName} randevular`)}`, ...events, "END:VCALENDAR"].join("\r\n");
}
