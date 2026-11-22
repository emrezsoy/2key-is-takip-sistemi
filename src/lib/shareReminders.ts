import { prisma } from "@/lib/prisma";
import { pushNotification } from "@/lib/inAppNotify";
import { shareRecipients } from "@/lib/shareCalendar";
import { istanbulToday } from "@/lib/clientPayments";
import { istanbulInstant, SHARE_KIND_LABEL } from "@/lib/shareTime";

const MIN = 60 * 1000;
/** Hatırlatma, paylaşım saatinden bu kadar önce gider. */
const LEAD = 5 * MIN;
/** Sunucu kapalı kaldıysa, saati bu kadar geçmiş paylaşım için de bir kez hatırlatılır. */
const GRACE = 3 * 60 * MIN;

const pad = (n: number) => String(n).padStart(2, "0");

const istanbulHour = (now: Date) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hour12: false }).format(now)) % 24;


/** Dakikada bir çalışır:
 *  1) Meta Business'ta planlanmış paylaşımların saati gelince otomatik "paylaşıldı" işaretler (alarm yok).
 *  2) Diğer paylaşımlar için saatinden 5 dk önce, saat girilmemişse o gün 10:00'da (Türkiye saati) bildirim gönderir. */
export async function runShareJobs(now = new Date()) {
  const today = istanbulToday(now);
  const todayIso = `${today.year}-${pad(today.month)}-${pad(today.day)}`;

  // 1) Eskiden Meta Business Suite'te elle planlanmış (metaStatus boş) kayıtları otomatik paylaşıldı yap.
  //    Sistemin kendi planladıkları (metaStatus dolu) src/lib/metaPublish.ts tarafından gerçekten yayınlanır.
  const meta = await prisma.sharePost.findMany({
    where: { metaScheduled: true, metaStatus: null, publishedAt: null, date: { lte: todayIso } },
    select: { id: true, date: true, time: true },
  });
  for (const p of meta) {
    // Saat varsa saati geldiğinde; saat yoksa gün geçtikten sonra.
    const due = p.time ? istanbulInstant(p.date, p.time).getTime() <= now.getTime() : p.date < todayIso;
    if (due) await prisma.sharePost.update({ where: { id: p.id }, data: { publishedAt: now } });
  }

  // 2) Hatırlatmalar (bugünün paylaşımları; paylaşılmış ve Meta'da planlı olanlar hariç).
  const candidates = await prisma.sharePost.findMany({
    where: { date: todayIso, publishedAt: null, metaScheduled: false, reminderSentAt: null },
    select: { id: true, date: true, time: true, kind: true, title: true, clientId: true, clientName: true },
  });
  if (candidates.length === 0) return;

  const hour = istanbulHour(now);

  for (const p of candidates) {
    let message: string | null = null;
    if (p.time) {
      const at = istanbulInstant(p.date, p.time).getTime();
      const t = now.getTime();
      if (t >= at - LEAD && t <= at + GRACE) {
        const mins = Math.max(Math.round((at - t) / MIN), 0);
        message = `${mins > 0 ? `${mins} dk sonra` : "Şimdi"} ${p.time} · ${p.clientName}: ${SHARE_KIND_LABEL[p.kind]} paylaşılacak${p.title ? ` — ${p.title}` : ""}`;
      }
    } else if (hour >= 10) {
      message = `Bugün paylaşılacak (saat belirlenmemiş) · ${p.clientName}: ${SHARE_KIND_LABEL[p.kind]}${p.title ? ` — ${p.title}` : ""}`;
    }
    if (!message) continue;

    // Önce işaretle: gönderim sırasında hata olsa bile tekrar tekrar bildirim gitmesin.
    await prisma.sharePost.update({ where: { id: p.id }, data: { reminderSentAt: now } });
    // Adminler ve bu müşteriden sorumlu, takvim yetkisi olanlar.
    const people = await shareRecipients(p.clientId);
    await Promise.all(
      people.map((u) =>
        pushNotification({
          userId: u.id,
          type: "SHARE_REMINDER",
          title: p.time ? "Paylaşım zamanı yaklaşıyor" : "Bugün paylaşım var",
          message,
          url: `/paylasim-takvimi?year=${today.year}&month=${today.month}`,
        })
      )
    );
  }
}
