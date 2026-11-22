import { prisma } from "@/lib/prisma";
import { getClientPayments, istanbulToday } from "@/lib/clientPayments";
import { formatCurrency } from "@/lib/format";
import { pushNotification } from "@/lib/inAppNotify";
import { sendPushToUser } from "@/lib/webpush";

const HOUR = 60 * 60 * 1000;

const istanbulHour = (now: Date) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hour12: false }).format(now)) % 24;

/** Gecikmiş ödemesi olan müşterilere, adminin seçtiği sıklıkta telefona bildirim gönderir.
 * Saatte bir çalışır; bildirim türü: günlük / haftalık / saat başı (gündüz saatlerinde). "Girişte pencere" ve "yok" burada işlenmez. */
export async function sendPaymentReminders(now = new Date()) {
  const hour = istanbulHour(now);
  const clients = await prisma.client.findMany({
    where: { isActive: true, notifyMode: { in: ["DAILY", "WEEKLY", "HOURLY"] } },
    select: {
      id: true,
      name: true,
      paymentDueDay: true,
      notifyMode: true,
      lastPaymentNotifyAt: true,
      users: { where: { role: "CLIENT", isActive: true, isDeleted: false, mustChangePassword: false }, select: { id: true } },
    },
  });

  const today = istanbulToday(now);
  const todayKey = `${today.year}-${today.month}-${today.day}`;

  for (const c of clients) {
    if (c.users.length === 0) continue;
    const last = c.lastPaymentNotifyAt;

    let due = false;
    if (c.notifyMode === "HOURLY") {
      // Gece rahatsız etmemek için 09:00-21:00 arası.
      due = hour >= 9 && hour < 21 && (!last || now.getTime() - last.getTime() >= 55 * 60 * 1000);
    } else if (c.notifyMode === "DAILY") {
      const lastKey = last ? (() => { const t = istanbulToday(last); return `${t.year}-${t.month}-${t.day}`; })() : null;
      due = hour >= 10 && lastKey !== todayKey;
    } else {
      due = hour >= 10 && (!last || now.getTime() - last.getTime() >= 7 * 24 * HOUR - HOUR);
    }
    if (!due) continue;

    const payments = await getClientPayments(c);
    if (payments.overdueCount === 0) continue;

    const title = "Ödeme hatırlatması";
    const message = `${payments.overdueCount} kalemde ${formatCurrency(payments.overdueAmount)} gecikmiş ödemeniz var.`;
    let delivered = false;

    for (const u of c.users) {
      if (c.notifyMode === "HOURLY") {
        // Saat başı bildirimde zil listesi dolmasın: sadece telefona gönderilir.
        const sent = await sendPushToUser(u.id, { title, body: message, url: "/panel/odemeler", tag: "payment" });
        if (sent > 0) delivered = true;
      } else {
        await pushNotification({ userId: u.id, type: "PAYMENT_REMINDER", title, message, url: "/panel/odemeler" });
        delivered = true;
      }
    }
    if (delivered) {
      await prisma.client.update({ where: { id: c.id }, data: { lastPaymentNotifyAt: now } });
    }
  }
}
