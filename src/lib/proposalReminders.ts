import { prisma } from "@/lib/prisma";
import { pushNotification } from "@/lib/inAppNotify";
import { proposalRecipients } from "@/lib/proposalAccess";
import { istanbulInstant } from "@/lib/shareTime";
import { REMIND_AFTER_DAYS, addDaysIso } from "@/lib/proposals";

const istanbulDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);

/** Teklif / rapor verildikten sonra (rapor 2 gün, teklif 3 gün) sabah 10:00'da işletmeyle iletişime geçme hatırlatması gönderir.
 * Sonuç hâlâ beklenen ("Sonuç bekleniyor") kayıtlar için, her bekleme dönemi başına bir kez. Sayı, kayıt sisteme girildiği günden
 * önceki bir tarihle girilmişse de girildiği günden sayılır (eski kayıtları girerken anında hatırlatma yağmasın). */
export async function runProposalReminders(now = new Date()) {
  const pending = await prisma.proposal.findMany({
    where: { status: "PENDING", reminderSentAt: null },
    select: {
      id: true,
      kind: true,
      companyName: true,
      contactName: true,
      contactPhone: true,
      lastSentDate: true,
      createdAt: true,
    },
  });
  const due = pending.filter((p) => {
    const created = istanbulDate(p.createdAt);
    const base = p.lastSentDate > created ? p.lastSentDate : created;
    const days = REMIND_AFTER_DAYS[p.kind] ?? 3;
    return istanbulInstant(addDaysIso(base, days), "10:00").getTime() <= now.getTime();
  });
  if (due.length === 0) return;

  const people = await proposalRecipients();
  for (const p of due) {
    // Önce işaretle: gönderim sırasında hata olsa bile tekrar tekrar bildirim gitmesin.
    await prisma.proposal.update({ where: { id: p.id }, data: { reminderSentAt: now } });
    const who = [p.contactName, p.contactPhone].filter(Boolean).join(" · ");
    const isReport = p.kind === "REPORT";
    const title = isReport ? "Rapor verildi: işletmeyle iletişime geç" : "Teklif verildi: sonucu öğren";
    const message = isReport
      ? `${p.companyName} için rapor verileli 2 gün oldu. Teklife dönüştürmek için işletmeyle iletişime geçin.${who ? ` (${who})` : ""}`
      : `${p.companyName} için teklif verileli 3 gün oldu. Teklif sonucunu öğrenip girmek için işletmeyle iletişime geçin.${who ? ` (${who})` : ""}`;
    await Promise.all(
      people.map((u) => pushNotification({ userId: u.id, type: "PROPOSAL_REMINDER", title, message, url: "/teklifler" }))
    );
  }
}
