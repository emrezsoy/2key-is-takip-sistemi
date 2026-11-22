"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canUseProposals } from "@/lib/proposalAccess";
import { driveIfConfigured, saveFilesToDrive, uploadMonth } from "@/lib/driveStorage";
import { validateUploadFile } from "@/lib/storage";
import { MONTHS } from "@/lib/format";
import {
  COMPANY_SIZES,
  DATE_RE,
  KINDS,
  KIND_LABEL,
  STATUSES,
  cleanServices,
  type ProposalKind,
} from "@/lib/proposals";

async function requireUser() {
  const session = await auth();
  if (!session?.user || !(await canUseProposals(session.user))) throw new Error("Teklifler sayfası için yetkiniz yok.");
  return session.user;
}

const refresh = () => revalidatePath("/teklifler");

const text = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const PHONE_RE = /^[\d\s+()\-.]{5,30}$/;
function cleanPhone(v: unknown) {
  const phone = text(v, 30);
  if (!phone) return null;
  if (!PHONE_RE.test(phone)) throw new Error("Telefon numarası geçerli görünmüyor (rakam, boşluk, +, -, parantez kullanın).");
  return phone;
}

/** Tarih boşsa (ya da geçersizse) bugün (Türkiye saati). Gelecek tarih de girilebilir. */
function dateOrToday(v: FormDataEntryValue | null) {
  const raw = String(v ?? "").trim();
  if (!raw) return uploadMonth().iso;
  if (!DATE_RE.test(raw) || Number.isNaN(Date.parse(raw))) throw new Error("Geçerli bir tarih seçin.");
  return raw;
}

const monthOf = (iso: string) => ({ key: iso.slice(0, 7), label: `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` });

/** Dosyayı Drive'da "Teklifler/<Ay Yıl>" klasörüne yükler (ay = dosyanın teklif tarihi). */
async function storeProposalFile(file: File, opts: { date: string; companyName: string; label: string; userId: string }) {
  validateUploadFile(file);
  const config = await driveIfConfigured();
  if (!config) throw new Error("Teklif dosyası yüklemek için Google Drive bağlı olmalı (Ayarlar).");
  const [saved] = await saveFilesToDrive(
    config,
    [file],
    { client: { id: null, name: "Teklifler" }, kind: "PROPOSAL", uploadedById: opts.userId, proposalMonth: monthOf(opts.date) },
    () => `${opts.date} ${opts.companyName} - ${opts.label}`
  );
  return { url: saved.url, name: file.name };
}

function readFile(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Teklif dosyasını seçin ya da sürükleyip bırakın.");
  return file;
}

function readServices(formData: FormData) {
  const services = cleanServices(formData.getAll("services"));
  if (services.length === 0) throw new Error("En az bir hizmet seçin.");
  const customService = services.includes("CUSTOM") ? text(formData.get("customService"), 200) || null : null;
  return { services, customService };
}

/** Yeni teklif / rapor: form bilgileri + dosya. */
export async function createProposal(formData: FormData) {
  const user = await requireUser();
  const companyName = text(formData.get("companyName"), 150);
  if (!companyName) throw new Error("Firma adı zorunlu.");
  const companySize = String(formData.get("companySize") ?? "");
  if (!COMPANY_SIZES.some((s) => s.key === companySize)) throw new Error("Firma büyüklüğünü seçin.");
  const kind = String(formData.get("kind") ?? "") as ProposalKind;
  if (!KINDS.some((k) => k.key === kind)) throw new Error("Teklif mi rapor mu olduğunu seçin.");
  const { services, customService } = readServices(formData);
  const contactName = text(formData.get("contactName"), 120) || null;
  const contactPhone = cleanPhone(formData.get("contactPhone"));
  const date = dateOrToday(formData.get("date"));
  const file = readFile(formData);

  // Önce dosya Drive'a gider; olmazsa kayıt oluşmaz.
  const stored = await storeProposalFile(file, { date, companyName, label: KIND_LABEL[kind], userId: user.id });

  await prisma.proposal.create({
    data: {
      companyName,
      companySize,
      kind,
      services: JSON.stringify(services),
      customService,
      contactName,
      contactPhone,
      date,
      lastSentDate: date,
      createdById: user.id,
      createdByName: user.name ?? null,
      files: { create: { version: 1, type: kind, url: stored.url, name: stored.name, date, uploadedByName: user.name ?? null } },
    },
  });
  refresh();
}

/** Yeni dosya sürümü: teklif için revize teklif; rapor için "teklife çevir" (teklif dosyası). Hizmetler değiştirilebilir. */
export async function addProposalFile(id: string, formData: FormData) {
  const user = await requireUser();
  const proposal = await prisma.proposal.findUnique({ where: { id }, include: { files: { select: { version: true } } } });
  if (!proposal) throw new Error("Kayıt bulunamadı.");

  const file = readFile(formData);
  const date = dateOrToday(formData.get("date"));
  const hasServices = formData.getAll("services").length > 0;
  const svc = hasServices ? readServices(formData) : null;

  const converting = proposal.kind === "REPORT";
  const version = Math.max(0, ...proposal.files.map((f) => f.version)) + 1;
  const type = converting ? "PROPOSAL" : "REVISION";
  const label = converting ? "Teklif" : `Revize ${version - 1}`;

  const stored = await storeProposalFile(file, { date, companyName: proposal.companyName, label, userId: user.id });

  await prisma.$transaction([
    prisma.proposalFile.create({
      data: { proposalId: id, version, type, url: stored.url, name: stored.name, date, uploadedByName: user.name ?? null },
    }),
    prisma.proposal.update({
      where: { id },
      data: {
        ...(converting ? { kind: "PROPOSAL", fromReport: true } : {}),
        // Yeni dosya iletildi: sonuç tekrar bekleniyor, hatırlatma yeniden kurulur.
        status: "PENDING",
        resultAt: null,
        lastSentDate: date,
        reminderSentAt: null,
        ...(svc ? { services: JSON.stringify(svc.services), customService: svc.customService } : {}),
      },
    }),
  ]);
  refresh();
}

/** Listeden sonuç girişi: Onay / Red / Teklif revizesi istendi / Sonuç bekleniyor. */
export async function setProposalStatus(id: string, status: string) {
  await requireUser();
  if (!STATUSES.some((s) => s.key === status)) throw new Error("Geçersiz durum.");
  const proposal = await prisma.proposal.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!proposal) throw new Error("Kayıt bulunamadı.");
  if (proposal.status === status) return;

  await prisma.proposal.update({
    where: { id },
    data: {
      status,
      resultAt: status === "APPROVED" || status === "REJECTED" ? new Date() : null,
      // Tekrar "sonuç bekleniyor"a alınırsa hatırlatma bugünden itibaren yeniden sayılır.
      ...(status === "PENDING" ? { reminderSentAt: null, lastSentDate: uploadMonth().iso } : {}),
    },
  });
  refresh();
}

export type ProposalEdit = {
  companyName: string;
  companySize: string;
  contactName: string;
  contactPhone: string;
  resultNote: string;
  services: string[];
  customService: string;
  date: string;
};

/** Detay penceresinden bilgi düzeltme (firma, büyüklük, kişi, telefon, hizmetler, not, tarih). */
export async function updateProposal(id: string, input: ProposalEdit) {
  await requireUser();
  const companyName = text(input.companyName, 150);
  if (!companyName) throw new Error("Firma adı zorunlu.");
  if (!COMPANY_SIZES.some((s) => s.key === input.companySize)) throw new Error("Firma büyüklüğünü seçin.");
  const services = cleanServices(input.services ?? []);
  if (services.length === 0) throw new Error("En az bir hizmet seçin.");
  const date = String(input.date ?? "").trim();
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) throw new Error("Geçerli bir tarih seçin.");

  const exists = await prisma.proposal.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new Error("Kayıt bulunamadı.");

  await prisma.proposal.update({
    where: { id },
    data: {
      companyName,
      companySize: input.companySize,
      contactName: text(input.contactName, 120) || null,
      contactPhone: cleanPhone(input.contactPhone),
      resultNote: String(input.resultNote ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 2000) || null,
      services: JSON.stringify(services),
      customService: services.includes("CUSTOM") ? text(input.customService, 200) || null : null,
      date,
    },
  });
  refresh();
}

export async function deleteProposal(id: string) {
  await requireUser();
  await prisma.proposal.delete({ where: { id } }).catch(() => null);
  refresh();
}
