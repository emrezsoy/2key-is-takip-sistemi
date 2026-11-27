"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireDmActor } from "@/lib/dm/access";
import { approveOnboarding, finishOnboardingCall, rejectOnboarding, saveOnboardingField, startOnboarding, submitOnboardingUploads } from "@/lib/dm/onboarding";

async function actorFor(clientId: string, adminOnly = false) {
  const session = await auth();
  if (!session?.user) throw new Error("Oturum bulunamadı.");
  return requireDmActor(session.user, clientId, adminOnly ? { adminOnly: true } : { allowClient: true });
}
async function obActor(id: string, adminOnly = false) {
  const ob = await prisma.dmOnboardingSession.findUnique({ where: { id }, select: { clientId: true } });
  if (!ob) throw new Error("Kurulum kaydı bulunamadı.");
  return actorFor(ob.clientId, adminOnly);
}
const refresh = () => {
  revalidatePath("/mesaj-otomasyonu", "layout");
  revalidatePath("/panel/mesajlar");
  revalidatePath("/mesaj", "layout");
};

export async function startOnboardingAction(clientId: string, ownerName: string, businessName: string) {
  const actor = await actorFor(clientId);
  const ob = await startOnboarding(clientId, { ownerName, businessName, byName: actor.name });
  refresh();
  return ob.id;
}

export async function saveOnboardingFieldAction(id: string, key: string, value: string) {
  await obActor(id);
  return saveOnboardingField(id, key, value);
}

export async function finishOnboardingCallAction(id: string, transcript: { role: "assistant" | "user"; text: string }[], durationSec: number) {
  await obActor(id);
  await finishOnboardingCall(id, transcript, durationSec);
  refresh();
}

export async function submitOnboardingUploadsAction(id: string, formData: FormData) {
  await obActor(id);
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  await submitOnboardingUploads(id, files, String(formData.get("note") ?? ""));
  refresh();
}

export async function approveOnboardingAction(id: string, promptText: string, applyModules: boolean) {
  const actor = await obActor(id, true);
  if (promptText.trim().length < 20) throw new Error("Talimat metni çok kısa.");
  await approveOnboarding(id, { promptText, applyModules, byId: actor.id, byName: actor.name });
  refresh();
}

export async function rejectOnboardingAction(id: string) {
  const actor = await obActor(id, true);
  await rejectOnboarding(id, actor.name);
  refresh();
}
