"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/permissions";
import { clearDriveConfig, getDriveConfig, saveDriveConfig, testDrive } from "@/lib/drive";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) throw new Error("Bu işlem sadece yöneticiler içindir.");
}

const errText = (e: unknown) => (e instanceof Error ? e.message : "Bilinmeyen hata.");

/** Servis hesabı anahtarını (JSON) ve Ortak Drive kimliğini doğrular, şifreli kaydeder. */
export async function connectDrive(serviceAccountJson: string, rootId: string) {
  await requireAdmin();
  const root = rootId.trim();
  if (!/^[A-Za-z0-9_-]{10,}$/.test(root)) throw new Error("Ortak Drive kimliği geçersiz görünüyor.");

  let email: string;
  try {
    email = await saveDriveConfig(serviceAccountJson, root);
    const config = await getDriveConfig();
    if (!config) throw new Error("Ayarlar kaydedilemedi.");
    const driveName = await testDrive(config);
    revalidatePath("/ayarlar");
    return { email, driveName };
  } catch (e) {
    // Doğrulanamayan bilgileri saklı bırakma.
    await clearDriveConfig();
    throw new Error(`Drive bağlanamadı: ${errText(e)}`);
  }
}

export async function checkDrive() {
  await requireAdmin();
  const config = await getDriveConfig();
  if (!config) throw new Error("Drive bağlı değil.");
  try {
    return { driveName: await testDrive(config), email: config.account.client_email };
  } catch (e) {
    throw new Error(`Drive'a ulaşılamadı: ${errText(e)}`);
  }
}

export async function disconnectDrive() {
  await requireAdmin();
  await clearDriveConfig();
  revalidatePath("/ayarlar");
}
