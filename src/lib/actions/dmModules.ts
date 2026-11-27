"use server";

// Randevu, ürün / stok ve takip mesajı işlemleri (admin, yetkili ekip üyesi ve müşterinin kendisi).
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { requireDmActor } from "@/lib/dm/access";
import { createManualAppointment, decideAppointment, parseLocal } from "@/lib/dm/appointments";
import { importProducts } from "@/lib/dm/products";
import { parseCsv, parseXlsx, rowsToProducts } from "@/lib/dm/productImport";
import { enqueue } from "@/lib/dm/queue";
import { localToDate } from "@/lib/dm/availability";

async function actorFor(clientId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");
  return requireDmActor(session.user, clientId, { allowClient: true });
}
const refresh = () => {
  revalidatePath("/mesaj-otomasyonu", "layout");
  revalidatePath("/panel/mesajlar");
  revalidatePath("/mesaj", "layout");
};

// ---------- Randevu ----------
export async function decideAppointmentAction(id: string, decision: "CONFIRM" | "REJECT" | "PROPOSE", proposed?: string) {
  const a = await prisma.dmAppointment.findUnique({ where: { id }, select: { clientId: true } });
  if (!a) throw new Error("Randevu bulunamadı.");
  const actor = await actorFor(a.clientId);
  const when = proposed ? parseLocal(proposed) : undefined;
  if (decision === "PROPOSE" && !when) throw new Error("Geçerli bir tarih/saat seçin.");
  await decideAppointment(id, decision, actor.name, when ?? undefined);
  refresh();
}

export async function cancelAppointment(id: string) {
  const a = await prisma.dmAppointment.findUnique({ where: { id }, select: { clientId: true } });
  if (!a) throw new Error("Randevu bulunamadı.");
  const actor = await actorFor(a.clientId);
  await prisma.dmAppointment.update({ where: { id }, data: { status: "CANCELLED", decidedByName: actor.name, decidedAt: new Date() } });
  refresh();
}

export async function addManualAppointment(clientId: string, formData: FormData) {
  const actor = await actorFor(clientId);
  const start = parseLocal(String(formData.get("start") ?? ""));
  if (!start) throw new Error("Tarih ve saat seçin.");
  const dur = Number(formData.get("duration") || 0) || undefined;
  await createManualAppointment(clientId, {
    start, durationMin: dur, name: String(formData.get("name") ?? "").trim(), phone: String(formData.get("phone") ?? "").trim(),
    service: String(formData.get("service") ?? "").trim(), note: String(formData.get("note") ?? "").trim(), byName: actor.name,
  });
  refresh();
}

/** Çalışma kuralları: haftalık açık saatler + kapalı tarih aralıkları (tamamı yeniden yazılır). */
export async function saveAvailability(
  clientId: string,
  input: {
    weekly: { weekday: number; startTime: string; endTime: string }[];
    closed: { from: string; to: string; note?: string }[];
    durationMin?: number;
    gapMin?: number;
  }
) {
  await actorFor(clientId);
  const dur = Math.round(Number(input.durationMin));
  const gap = Math.round(Number(input.gapMin));
  if (input.durationMin !== undefined && !(dur >= 5 && dur <= 600)) throw new Error("Randevu süresi 5-600 dakika arasında olmalı.");
  if (input.gapMin !== undefined && !(gap >= 0 && gap <= 240)) throw new Error("İki randevu arası 0-240 dakika arasında olmalı.");
  if (input.durationMin !== undefined || input.gapMin !== undefined) {
    const data = { ...(input.durationMin !== undefined ? { appointmentDurationMin: dur } : {}), ...(input.gapMin !== undefined ? { appointmentGapMin: gap } : {}) };
    await prisma.dmConfig.upsert({ where: { clientId }, create: { clientId, ...data }, update: data });
  }
  const weekly = input.weekly.filter((w) => w.weekday >= 1 && w.weekday <= 7 && /^\d{2}:\d{2}$/.test(w.startTime) && /^\d{2}:\d{2}$/.test(w.endTime) && w.startTime < w.endTime);
  const closed = input.closed.filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.from) && /^\d{4}-\d{2}-\d{2}$/.test(c.to) && c.from <= c.to);
  await prisma.$transaction([
    prisma.dmAvailabilityRule.deleteMany({ where: { clientId } }),
    prisma.dmAvailabilityRule.createMany({
      data: [
        ...weekly.map((w) => ({ clientId, kind: "WEEKLY_OPEN" as const, weekday: w.weekday, startTime: w.startTime, endTime: w.endTime })),
        ...closed.map((c) => ({ clientId, kind: "CLOSED_RANGE" as const, startAt: localToDate(c.from, "00:00"), endAt: localToDate(c.to, "23:59"), note: c.note?.slice(0, 200) || null })),
      ],
    }),
  ]);
  refresh();
}

/** Gizli iCal bağlantısı oluşturur / yeniler. */
export async function regenerateCalendarToken(clientId: string) {
  await actorFor(clientId);
  const token = crypto.randomBytes(24).toString("base64url");
  await prisma.dmConfig.upsert({ where: { clientId }, create: { clientId, calendarToken: token }, update: { calendarToken: token } });
  refresh();
  return token;
}

// ---------- Ürün / stok ----------
export async function saveStoreConnection(clientId: string, input: { platform: "SHOPIFY" | "IKAS" | "TICIMAX"; shopDomain: string; accessToken?: string; clientIdKey?: string; clientSecret?: string; apiKey?: string }) {
  await actorFor(clientId);
  const creds = input.platform === "SHOPIFY" ? { accessToken: input.accessToken?.trim() } : input.platform === "IKAS" ? { clientId: input.clientIdKey?.trim(), clientSecret: input.clientSecret?.trim() } : { apiKey: input.apiKey?.trim() };
  if (Object.values(creds).some((v) => !v)) throw new Error("Bağlantı bilgileri eksik.");
  if (!input.shopDomain.trim()) throw new Error("Mağaza adresi gerekli.");
  const existing = await prisma.dmStoreConnection.findFirst({ where: { clientId, platform: input.platform } });
  const data = { shopDomain: input.shopDomain.trim(), credentials: encryptSecret(JSON.stringify(creds)), isActive: true, lastError: null };
  const conn = existing ? await prisma.dmStoreConnection.update({ where: { id: existing.id }, data }) : await prisma.dmStoreConnection.create({ data: { ...data, clientId, platform: input.platform, name: input.platform } });
  await enqueue("SYNC_PRODUCTS", { connectionId: conn.id }, { dedupeKey: `sync:${conn.id}` });
  refresh();
}

export async function syncNow(connectionId: string) {
  const c = await prisma.dmStoreConnection.findUnique({ where: { id: connectionId }, select: { clientId: true } });
  if (!c) throw new Error("Bağlantı bulunamadı.");
  await actorFor(c.clientId);
  await enqueue("SYNC_PRODUCTS", { connectionId }, { dedupeKey: `sync:${connectionId}` });
  refresh();
}

export async function importProductsFile(clientId: string, formData: FormData) {
  await actorFor(clientId);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Dosya seçin.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Dosya en fazla 10 MB olabilir.");
  const buf = new Uint8Array(await file.arrayBuffer());
  const rows = /\.xlsx$/i.test(file.name) ? parseXlsx(buf) : parseCsv(new TextDecoder("utf-8").decode(buf));
  const { products, errors } = rowsToProducts(rows);
  if (!products.length) throw new Error(errors[0] ?? "Dosyada ürün bulunamadı.");
  const r = await importProducts(clientId, products);
  const manual = await prisma.dmStoreConnection.findFirst({ where: { clientId, platform: "MANUAL" } });
  if (manual) await enqueue("SYNC_PRODUCTS", { connectionId: manual.id }, { dedupeKey: `sync:${manual.id}` });
  refresh();
  return { ...r, errors: errors.slice(0, 10) };
}

export async function saveManualProduct(clientId: string, input: { name: string; description: string; price: string; url: string; image: string; variants: string; stock: string }) {
  await actorFor(clientId);
  const name = input.name.trim();
  if (!name) throw new Error("Ürün adı gerekli.");
  const rows = [
    ["Ad", "Açıklama", "Fiyat", "Bağlantı", "Görsel", "Varyant", "Stok"],
    ...(input.variants.trim()
      ? input.variants.split("\n").filter((l) => l.trim()).map((l) => {
          const [v, s] = l.split("=");
          return [name, input.description, input.price, input.url, input.image, v.trim(), (s ?? "").trim()];
        })
      : [[name, input.description, input.price, input.url, input.image, "", input.stock]]),
  ];
  const { products } = rowsToProducts(rows);
  await importProducts(clientId, products);
  const manual = await prisma.dmStoreConnection.findFirst({ where: { clientId, platform: "MANUAL" } });
  if (manual) await enqueue("SYNC_PRODUCTS", { connectionId: manual.id }, { dedupeKey: `sync:${manual.id}` });
  refresh();
}

export async function setProductActive(productId: string, isActive: boolean) {
  const p = await prisma.dmProduct.findUnique({ where: { id: productId }, select: { clientId: true } });
  if (!p) throw new Error("Ürün bulunamadı.");
  await actorFor(p.clientId);
  await prisma.dmProduct.update({ where: { id: productId }, data: { isActive } });
  refresh();
}

// ---------- Takip mesajları ----------
export async function decideFollowUp(id: string, approve: boolean, text?: string) {
  const f = await prisma.dmFollowUp.findUnique({ where: { id } });
  if (!f) throw new Error("Takip mesajı bulunamadı.");
  const actor = await actorFor(f.clientId);
  if (f.status !== "PENDING_APPROVAL") throw new Error("Bu mesaj artık onay beklemiyor.");
  await prisma.dmFollowUp.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "REJECTED", decidedByName: actor.name, decidedAt: new Date(), ...(approve && text?.trim() ? { text: text.trim().slice(0, 1000) } : {}) },
  });
  refresh();
}

export async function approveAllFollowUps(clientId: string) {
  const actor = await actorFor(clientId);
  await prisma.dmFollowUp.updateMany({ where: { clientId, status: "PENDING_APPROVAL" }, data: { status: "APPROVED", decidedByName: actor.name, decidedAt: new Date() } });
  refresh();
}
