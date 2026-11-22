"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** Ana ekrandaki müşteri kutularının sırasını bu kullanıcı için kaydeder (kişiye özel). */
export async function saveClientOrder(ids: string[]) {
  const session = await auth();
  if (!session?.user || session.user.role === "CLIENT") throw new Error("Yetkisiz.");
  if (!Array.isArray(ids) || ids.length > 500 || ids.some((i) => typeof i !== "string" || i.length > 40)) {
    throw new Error("Geçersiz sıralama.");
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { clientOrder: JSON.stringify([...new Set(ids)]) },
  });
}
