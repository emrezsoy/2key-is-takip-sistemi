"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  RADIO_MAX_QUEUED_PER_USER,
  RadioError,
  cleanupRadioHistory,
  ensureRadioPlaying,
  fetchYouTubeInfo,
  finishRadioTrack,
  parseYouTubeId,
  regenerateRadioTvToken,
  setRadioPausedSetting,
  setRadioVolumeSetting,
} from "@/lib/radio";

export type RadioResult = { ok: true; message?: string } | { ok: false; error: string };

async function teamUser() {
  const session = await auth();
  if (!session?.user || session.user.role === "CLIENT") return null;
  return session.user;
}

export async function addRadioTrack(link: string): Promise<RadioResult> {
  const user = await teamUser();
  if (!user) return { ok: false, error: "Yetkiniz yok." };
  const videoId = parseYouTubeId(link ?? "");
  if (!videoId) return { ok: false, error: "Geçerli bir YouTube linki yapıştırın (youtube.com/watch?v=… ya da youtu.be/…)." };

  const [mine, dup] = await Promise.all([
    prisma.radioTrack.count({ where: { addedById: user.id, status: "QUEUED" } }),
    prisma.radioTrack.findFirst({ where: { videoId, status: { in: ["QUEUED", "PLAYING"] } } }),
  ]);
  if (dup) return { ok: false, error: dup.status === "PLAYING" ? "Bu şarkı şu an çalıyor." : "Bu şarkı zaten sırada." };
  if (mine >= RADIO_MAX_QUEUED_PER_USER) {
    return { ok: false, error: `Sırada en fazla ${RADIO_MAX_QUEUED_PER_USER} şarkın olabilir. Biri çalınca yenisini ekleyebilirsin.` };
  }

  try {
    const info = await fetchYouTubeInfo(videoId);
    await prisma.radioTrack.create({
      data: { videoId, title: info.title, channel: info.channel, addedById: user.id, addedByName: user.name ?? user.username },
    });
    await ensureRadioPlaying();
    await cleanupRadioHistory();
    revalidatePath("/radyo");
    return { ok: true, message: `“${info.title}” sıraya eklendi.` };
  } catch (e) {
    if (e instanceof RadioError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Sıradaki şarkıyı kaldırır (ekipteki herkes). */
export async function removeRadioTrack(trackId: string): Promise<RadioResult> {
  const user = await teamUser();
  if (!user) return { ok: false, error: "Yetkiniz yok." };
  const track = await prisma.radioTrack.findUnique({ where: { id: trackId } });
  if (!track || track.status !== "QUEUED") return { ok: false, error: "Şarkı artık sırada değil." };
  await prisma.radioTrack.deleteMany({ where: { id: trackId, status: "QUEUED" } });
  revalidatePath("/radyo");
  return { ok: true };
}

/** Çalan şarkıyı geçer: ekipteki herkes oy beklemeden geçebilir. */
export async function skipRadioTrack(trackId: string): Promise<RadioResult> {
  const user = await teamUser();
  if (!user) return { ok: false, error: "Yetkiniz yok." };
  const track = await prisma.radioTrack.findUnique({ where: { id: trackId } });
  if (!track || track.status !== "PLAYING") return { ok: false, error: "Bu şarkı artık çalmıyor." };

  await finishRadioTrack(trackId, "SKIPPED");
  revalidatePath("/radyo");
  return { ok: true, message: "Şarkı geçildi." };
}

async function adminUser() {
  const user = await teamUser();
  return user?.role === "ADMIN" ? user : null;
}

export async function setRadioPaused(paused: boolean): Promise<RadioResult> {
  if (!(await teamUser())) return { ok: false, error: "Yetkiniz yok." };
  await setRadioPausedSetting(paused);
  revalidatePath("/radyo");
  return { ok: true };
}

export async function setRadioVolume(volume: number): Promise<RadioResult> {
  if (!(await teamUser())) return { ok: false, error: "Yetkiniz yok." };
  if (!Number.isFinite(volume)) return { ok: false, error: "Geçersiz ses seviyesi." };
  await setRadioVolumeSetting(volume);
  revalidatePath("/radyo");
  return { ok: true };
}

export async function regenerateRadioLink(): Promise<RadioResult> {
  if (!(await adminUser())) return { ok: false, error: "Sadece yönetici TV bağlantısı oluşturabilir." };
  await regenerateRadioTvToken();
  revalidatePath("/radyo");
  return { ok: true };
}
