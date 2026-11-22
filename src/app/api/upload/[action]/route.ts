import { NextResponse } from "next/server";
import { addTaskAttachments, createClientJob } from "@/lib/actions/clientJobs";
import { createTask, replaceSubmissionFiles, submitTaskFile } from "@/lib/actions/tasks";
import { addContentItemFiles, uploadContentImage } from "@/lib/actions/content";
import { createClientRequest } from "@/lib/actions/clientRequests";
import { createSharePost, updateSharePost } from "@/lib/actions/sharePosts";
import { reviseDelivery, teamReviseDelivery, type DeliveryTarget } from "@/lib/actions/deliveries";
import { addProposalFile, createProposal } from "@/lib/actions/proposals";
import { updateAvatar } from "@/app/(app)/profil/actions";
import type { UploadAction } from "@/lib/uploadActions";

// Dosya yükleyen işlemler tarayıcıdan buraya gelir (yükleme yüzdesi gösterilebilsin diye XHR ile).
// İş mantığı ve yetki denetimi ilgili eylemlerin içindedir; burası sadece formu okuyup onlara iletir.
export const maxDuration = 600;

const str = (v: unknown) => {
  if (typeof v !== "string" || !v) throw new Error("Geçersiz istek.");
  return v;
};
const target = (v: unknown): DeliveryTarget => {
  const t = v as { type?: unknown; id?: unknown } | null;
  if (!t || (t.type !== "item" && t.type !== "request")) throw new Error("Geçersiz istek.");
  return { type: t.type, id: str(t.id) };
};

type Handler = (args: unknown[], fd: FormData) => Promise<unknown>;
const HANDLERS: Record<UploadAction, Handler> = {
  addTaskAttachments: (a, fd) => addTaskAttachments(str(a[0]), fd),
  submitTaskFile: (a, fd) => submitTaskFile(str(a[0]), fd),
  replaceSubmissionFiles: (a, fd) => replaceSubmissionFiles(str(a[0]), fd),
  createClientJob: (a, fd) => createClientJob(str(a[0]), fd),
  createTask: (_a, fd) => createTask(fd),
  addContentItemFiles: (a, fd) => addContentItemFiles(str(a[0]), fd),
  uploadContentImage: (a, fd) => uploadContentImage(str(a[0]), fd),
  createClientRequest: (_a, fd) => createClientRequest(fd),
  createSharePost: (_a, fd) => createSharePost(fd),
  updateSharePost: (a, fd) => updateSharePost(str(a[0]), fd),
  reviseDelivery: (a, fd) => reviseDelivery(target(a[0]), fd),
  teamReviseDelivery: (a, fd) => teamReviseDelivery(str(a[0]), fd),
  createProposal: (_a, fd) => createProposal(fd),
  addProposalFile: (a, fd) => addProposalFile(str(a[0]), fd),
  updateAvatar: (_a, fd) => updateAvatar(fd),
};

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  // Başka bir siteden gelen istekleri reddet (oturum çerezi zaten SameSite=Lax; ek güvenlik).
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!host || new URL(origin).host !== host) return fail("İstek reddedildi.", 403);
  }

  const { action } = await params;
  const handler = Object.prototype.hasOwnProperty.call(HANDLERS, action) ? HANDLERS[action as UploadAction] : undefined;
  if (!handler) return fail("Bilinmeyen işlem.", 404);

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return fail("Yükleme alınamadı; bağlantı kesilmiş ya da dosya çok büyük olabilir. Lütfen tekrar deneyin.");
  }

  try {
    let args: unknown[] = [];
    const rawArgs = fd.get("__args");
    if (typeof rawArgs === "string") {
      const parsed = JSON.parse(rawArgs);
      if (Array.isArray(parsed)) args = parsed;
    }
    fd.delete("__args");
    const data = await handler(args, fd);
    return NextResponse.json({ ok: true, data: data ?? null });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "İşlem yapılamadı.");
  }
}
