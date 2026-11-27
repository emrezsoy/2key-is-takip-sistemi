// Medya ön analizi: görsel / video / reklam için yazılı özet üretir ve önbelleğe (DmMediaAnalysis) yazar.
// Konuşma geçmişine ham medya değil bu özet girer. Aynı reklam / post bir kez analiz edilir.
import { prisma } from "@/lib/prisma";
import { aiDescribe } from "./ai";
import type { MediaKey } from "./mediaKeys";

const MAX_BYTES = 19 * 1024 * 1024; // istek içinde gönderilebilecek üst sınıra yakın

const PROMPTS: Record<MediaKey["kind"], string> = {
  IMAGE: "Bir müşteri işletmeye Instagram/Facebook mesajında bu görseli gönderdi. Görselde ne olduğunu Türkçe ve ayrıntılı yaz: ürün/nesne, renk, model, marka, üzerindeki yazılar, fiyat etiketi, ekran görüntüsüyse içindeki metin. Müşterinin ne sormak istiyor olabileceğini tahmin etme, sadece gördüğünü yaz.",
  VIDEO: "Bir müşteri işletmeye bu videoyu gönderdi. Videoda ne olduğunu Türkçe ve ayrıntılı yaz: gösterilen ürünler/kişiler/mekân, konuşulanlar, ekrandaki yazılar, fiyat ya da kampanya bilgisi.",
  AD: "Bu, işletmenin bir reklamı; müşteri bu reklamı görüp mesaj attı. Reklamı Türkçe ve ayrıntılı özetle: tanıtılan ürün/hizmet, öne çıkan mesaj, kampanya/fiyat/indirim bilgisi, ekrandaki yazılar, konuşulanlar, çağrı (ör. 'DM at').",
  POST: "Bu, müşterinin mesajda paylaştığı ya da yanıtladığı bir gönderi/reels. Türkçe ve ayrıntılı özetle: ne gösteriliyor, ürün, yazılar, fiyat/kampanya bilgisi.",
  STORY: "Bu, müşterinin yanıtladığı bir hikâye (story). Türkçe özetle: ne gösteriliyor, ürün, yazılar, kampanya bilgisi.",
};

async function download(url: string): Promise<{ mimeType: string; data: string } | null> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) return null;
  const mimeType = (res.headers.get("content-type") ?? "").split(";")[0] || "application/octet-stream";
  return { mimeType, data: buf.toString("base64") };
}

/** ANALYZE_MEDIA işi. Hata verirse özet "analiz edilemedi" olarak kaydedilir ki cevap bekletilmesin. */
export async function analyzeMedia(payload: { clientId: string; messageId?: string; key: string; kind: MediaKey["kind"]; url?: string; title?: string }) {
  if (await prisma.dmMediaAnalysis.findUnique({ where: { key: payload.key } })) return;
  const config = await prisma.dmConfig.findUnique({ where: { clientId: payload.clientId }, select: { mediaModel: true } });
  let summary: string;
  let model: string | null = null;
  try {
    const media = payload.url ? await download(payload.url) : null;
    if (!media) {
      summary = payload.title ? `${payload.kind === "AD" ? "Reklam" : "İçerik"} başlığı: ${payload.title} (görsel/video indirilemedi)` : "(Medya indirilemedi ya da çok büyük; içerik analiz edilemedi.)";
    } else {
      const r = await aiDescribe(config?.mediaModel, PROMPTS[payload.kind] + (payload.title ? `\nBaşlık: ${payload.title}` : ""), media, {
        clientId: payload.clientId, kind: "MEDIA", messageId: payload.messageId,
      });
      summary = r.text || "(Analiz boş döndü.)";
      model = r.ref;
    }
  } catch (e) {
    summary = `(Medya analiz edilemedi: ${e instanceof Error ? e.message.slice(0, 160) : "hata"})`;
  }
  await prisma.dmMediaAnalysis.upsert({
    where: { key: payload.key },
    update: {},
    create: { key: payload.key, kind: payload.kind, summary, model, clientId: payload.clientId },
  });
}
