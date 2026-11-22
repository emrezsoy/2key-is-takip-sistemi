"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageClients } from "@/lib/permissions";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !canManageClients(session.user)) {
    throw new Error("Bu işlem için yetkiniz yok.");
  }
  return session.user;
}

export async function createClient(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) throw new Error("Müşteri adı zorunludur.");

  await prisma.client.create({
    data: { name, contact: contact || null, notes: notes || null },
  });

  revalidatePath("/musteriler");
}

export async function updateClient(clientId: string, formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) throw new Error("Müşteri adı zorunludur.");

  await prisma.client.update({
    where: { id: clientId },
    data: { name, contact: contact || null, notes: notes || null },
  });

  revalidatePath("/musteriler");
}

export async function toggleClientActive(clientId: string, isActive: boolean) {
  await requireAdmin();

  await prisma.client.update({
    where: { id: clientId },
    data: { isActive },
  });

  revalidatePath("/musteriler");
}

export async function addClientCredential(clientId: string, formData: FormData) {
  await requireAdmin();

  const label = String(formData.get("label") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!label || !password) {
    throw new Error("Platform adı ve şifre zorunludur.");
  }

  await prisma.clientCredential.create({
    data: {
      clientId,
      label,
      username: username || null,
      encryptedPassword: encryptSecret(password),
      notes: notes || null,
    },
  });

  revalidatePath("/musteriler");
}

export async function updateClientCredential(credentialId: string, formData: FormData) {
  await requireAdmin();

  const label = String(formData.get("label") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!label) throw new Error("Platform adı zorunludur.");

  await prisma.clientCredential.update({
    where: { id: credentialId },
    data: {
      label,
      username: username || null,
      notes: notes || null,
      ...(password ? { encryptedPassword: encryptSecret(password) } : {}),
    },
  });

  revalidatePath("/musteriler");
}

export async function deleteClientCredential(credentialId: string) {
  await requireAdmin();
  await prisma.clientCredential.delete({ where: { id: credentialId } });
  revalidatePath("/musteriler");
}

export async function revealClientCredential(credentialId: string): Promise<string> {
  await requireAdmin();
  const credential = await prisma.clientCredential.findUnique({
    where: { id: credentialId },
    select: { encryptedPassword: true },
  });
  if (!credential) throw new Error("Kayıt bulunamadı.");
  return decryptSecret(credential.encryptedPassword);
}
