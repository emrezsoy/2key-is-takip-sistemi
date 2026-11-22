import { isSmtpConfigured, sendMail } from "@/lib/mailer";
import { renderNotificationEmail } from "@/lib/email-template";
import { formatDate } from "@/lib/format";

/** Görev/onay/revize e-postaları şimdilik kapalı (uygulama içi bildirimler çalışmaya devam eder).
 * Yeniden açmak için sunucu ortamına TASK_EMAIL_NOTIFICATIONS=true eklemek yeterli;
 * kişi bazlı "e-posta bildirimlerini al" ayarları ve gönderim altyapısı olduğu gibi duruyor. */
const taskEmailsEnabled = () => process.env.TASK_EMAIL_NOTIFICATIONS === "true";

async function safeSend(
  to: string,
  subject: string,
  html: string,
  attachments: { filename: string; path: string; cid: string }[]
) {
  if (!isSmtpConfigured()) return;
  try {
    await sendMail(to, subject, html, attachments);
  } catch (err) {
    console.error("E-posta gönderilemedi:", err);
  }
}

export async function notifyAccountCreated(params: {
  to: string;
  fullName: string;
  username: string;
  password: string;
  roleLabel: string;
}) {
  const { to, fullName, username, password, roleLabel } = params;

  const { html, attachments } = renderNotificationEmail({
    preheader: `${fullName}, Görev & Puantaj sistemine hoş geldin`,
    heading: `Hoş geldin, <span style="color:#f01c26;">${fullName.split(" ")[0]}</span>`,
    greeting: `Merhaba ${fullName},`,
    message:
      `Görev & Puantaj sistemine ${roleLabel.toLocaleLowerCase("tr-TR")} olarak bir hesap açıldı. Aşağıdaki bilgilerle giriş yapabilirsin.<br/><br/>` +
      `<strong>Güvenliğin için ilk girişinde şifreni değiştirmeni öneririz.</strong>`,
    infoRows: [
      { label: "Kullanıcı adı", value: username },
      { label: "Geçici şifre", value: password },
    ],
    ctaLabel: "Giriş yap",
  });

  await safeSend(to, "Hesabın oluşturuldu — Görev & Puantaj", html, attachments);
}

export async function notifyTaskAssigned(params: {
  to: string;
  assigneeName: string;
  taskTitle: string;
  clientName?: string | null;
  deadline?: Date | null;
}) {
  if (!taskEmailsEnabled()) return;
  const { to, assigneeName, taskTitle, clientName, deadline } = params;

  const { html, attachments } = renderNotificationEmail({
    preheader: `Sana yeni bir görev atandı: ${taskTitle}`,
    heading: `Yeni görev: <span style="color:#f01c26;">${taskTitle}</span>`,
    greeting: `Merhaba ${assigneeName},`,
    message: "Sana yeni bir görev atandı. Detayları panelden inceleyebilirsin.",
    infoRows: [
      ...(clientName ? [{ label: "Müşteri", value: clientName }] : []),
      ...(deadline ? [{ label: "Teslim tarihi", value: formatDate(deadline) }] : []),
    ],
    ctaLabel: "Görevi görüntüle",
  });

  await safeSend(to, `Yeni görev: ${taskTitle}`, html, attachments);
}

export async function notifyTaskPendingApproval(params: {
  to: string;
  recipientName: string;
  taskTitle: string;
  assigneeName: string;
}) {
  if (!taskEmailsEnabled()) return;
  const { to, recipientName, taskTitle, assigneeName } = params;

  const { html, attachments } = renderNotificationEmail({
    preheader: `${assigneeName}, ${taskTitle} görevini onayına sundu`,
    heading: `Onay bekliyor: <span style="color:#f01c26;">${taskTitle}</span>`,
    greeting: `Merhaba ${recipientName},`,
    message: `<strong>${assigneeName}</strong>, bu görevi tamamlayıp onayına sundu.`,
    ctaLabel: "Görevi incele",
  });

  await safeSend(to, `Onay bekliyor: ${taskTitle}`, html, attachments);
}

export async function notifyTaskReturnedToProgress(params: {
  to: string;
  assigneeName: string;
  taskTitle: string;
}) {
  if (!taskEmailsEnabled()) return;
  const { to, assigneeName, taskTitle } = params;

  const { html, attachments } = renderNotificationEmail({
    preheader: `${taskTitle} görevi revize için sana geri döndü`,
    heading: `Revize gerekiyor: <span style="color:#f01c26;">${taskTitle}</span>`,
    greeting: `Merhaba ${assigneeName},`,
    message: "Bu görev revize için sana geri döndü. Gerekli düzenlemeleri yapıp tekrar onaya gönderebilirsin.",
    ctaLabel: "Görevi görüntüle",
  });

  await safeSend(to, `Revize gerekiyor: ${taskTitle}`, html, attachments);
}
