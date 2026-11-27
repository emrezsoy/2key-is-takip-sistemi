import type { DmPricing } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Genel kredi fiyatları (tek satır). Yoksa varsayılanlarla oluşturulur. */
export async function getPricing(): Promise<DmPricing> {
  const row = await prisma.dmPricing.findUnique({ where: { id: "default" } });
  return row ?? prisma.dmPricing.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
}

/** Müşteriye özel eksi limit tanımlıysa o, yoksa genel ayar. */
export const negativeLimitFor = (pricing: DmPricing, clientLimit: number | null | undefined) =>
  clientLimit ?? pricing.negativeLimit;
