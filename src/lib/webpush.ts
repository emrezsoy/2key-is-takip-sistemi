import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

// Telefona bildirim (Web Push). VAPID anahtarları ilk kullanımda üretilir ve
// veritabanında (özel anahtar şifreli) saklanır; elle ortam değişkeni girmeye gerek yok.

const KEY = "vapid_keys";

type Vapid = { publicKey: string; privateKey: string };
let cache: Vapid | null = null;

async function loadVapid(): Promise<Vapid> {
  if (cache) return cache;
  const row = await prisma.integrationSetting.findUnique({ where: { key: KEY } });
  if (row) {
    const parsed = JSON.parse(row.value) as { publicKey: string; privateKey: string };
    cache = { publicKey: parsed.publicKey, privateKey: decryptSecret(parsed.privateKey) };
    return cache;
  }
  const keys = webpush.generateVAPIDKeys();
  await prisma.integrationSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify({ publicKey: keys.publicKey, privateKey: encryptSecret(keys.privateKey) }) },
    update: {},
  });
  // Eşzamanlı çağrıda başka süreç yazmış olabilir; kalıcı olanı oku.
  const saved = await prisma.integrationSetting.findUniqueOrThrow({ where: { key: KEY } });
  const parsed = JSON.parse(saved.value) as { publicKey: string; privateKey: string };
  cache = { publicKey: parsed.publicKey, privateKey: decryptSecret(parsed.privateKey) };
  return cache;
}

export async function getVapidPublicKey() {
  return (await loadVapid()).publicKey;
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

/** Kullanıcının tüm cihazlarına bildirim gönderir. Geçersiz (silinmiş) abonelikleri temizler. Hata fırlatmaz. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return 0;
    const vapid = await loadVapid();
    const details = {
      vapidDetails: {
        subject: process.env.VAPID_SUBJECT ?? "mailto:info@2keyidea.com",
        publicKey: vapid.publicKey,
        privateKey: vapid.privateKey,
      },
      TTL: 60 * 60 * 24,
    };
    const body = JSON.stringify(payload);
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
            { TTL: details.TTL, vapidDetails: details.vapidDetails }
          );
          sent++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await prisma.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } });
          } else {
            console.error("Push gönderilemedi:", status ?? e);
          }
        }
      })
    );
    return sent;
  } catch (e) {
    console.error("Push hatası:", e);
    return 0;
  }
}
