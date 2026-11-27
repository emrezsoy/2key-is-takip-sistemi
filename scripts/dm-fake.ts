// Sahte Meta webhook'u: Meta ile aynı biçimde ve aynı imzayla dm-worker'a mesaj gönderir (gerçek bağlantı olmadan test).
// Kullanım:
//   npm run dm:fake -- --client "Cafe Nero" --text "Merhaba, fiyat nedir?"
//   npm run dm:fake -- --client "Cafe Nero" --from kisi2 --image https://picsum.photos/600
//   npm run dm:fake -- --client "Cafe Nero" --ad AD123 --ad-video https://.../reklam.mp4 --text "Bu ürün var mı?"
//   npm run dm:fake -- --client "Cafe Nero" --echo --text "Ben bakıyorum" (işletme sahibi uygulamadan yazdı)
//   npm run dm:fake -- --client "Cafe Nero" --fb --text "Messenger'dan selam"
// Müşterinin bağlı sayfası yoksa yerelde sahte bir sayfa/IG hesabı oluşturur (yalnızca DM_CHANNEL_MODE=fake iken).
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true);

async function main() {
  const { prisma } = await import("@/lib/prisma");
  const { signMetaBody } = await import("@/lib/dm/channels/metaParse");
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const flag = (name: string) => args.includes(`--${name}`);

  if ((process.env.DM_CHANNEL_MODE ?? "fake") === "meta") throw new Error("DM_CHANNEL_MODE=meta iken sahte webhook kullanılmaz.");
  const secret = process.env.META_DM_APP_SECRET;
  if (!secret) throw new Error(".env'de META_DM_APP_SECRET tanımlı değil (yerelde rastgele bir değer yeterli).");
  const clientName = opt("client");
  if (!clientName) throw new Error("--client \"Müşteri adı\" gerekli.");
  const client = await prisma.client.findFirst({ where: { OR: [{ name: clientName }, { id: clientName }] } });
  if (!client) throw new Error(`Müşteri bulunamadı: ${clientName}`);

  let acc = await prisma.socialAccount.findFirst({ where: { clientId: client.id } });
  if (!acc) {
    const slug = client.id.replace(/\W+/g, "").slice(0, 20).toLowerCase();
    acc = await prisma.socialAccount.create({
      data: { pageId: `fakepage_${slug}`, pageName: `${client.name} (sahte)`, igId: `fakeig_${slug}`, igUsername: slug, clientId: client.id },
    });
    console.log(`Sahte sayfa oluşturuldu: ${acc.pageId} / ${acc.igId}`);
  }
  const fb = flag("fb");
  const accountId = fb ? acc.pageId : acc.igId ?? acc.pageId;
  const contact = opt("from") ?? "kisi1";
  const mid = `fake_mid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const attachments: unknown[] = [];
  if (opt("image")) attachments.push({ type: "image", payload: { url: opt("image") } });
  if (opt("video")) attachments.push({ type: "video", payload: { url: opt("video") } });
  const message: Record<string, unknown> = { mid };
  if (opt("text")) message.text = opt("text");
  if (attachments.length) message.attachments = attachments;
  if (opt("ad")) {
    message.referral = {
      ref: "fake", ad_id: opt("ad"), source: "ADS", type: "OPEN_THREAD",
      ads_context_data: { ad_title: opt("ad-title") ?? "Deneme reklamı", video_url: opt("ad-video"), photo_url: opt("ad-photo") },
    };
  }
  const echo = flag("echo");
  if (echo) message.is_echo = true;
  const body = JSON.stringify({
    object: fb ? "page" : "instagram",
    entry: [{
      id: accountId, time: Date.now(),
      messaging: [{
        sender: { id: echo ? accountId : contact }, recipient: { id: echo ? contact : accountId }, timestamp: Date.now(), message,
      }],
    }],
  });
  const url = `http://127.0.0.1:${process.env.DM_WORKER_PORT ?? 3005}/api/dm/webhook`;
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signMetaBody(body, secret) }, body });
  console.log(`${res.status} ${await res.text()} → ${fb ? "Facebook" : "Instagram"} / ${client.name} / kişi: ${contact}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
