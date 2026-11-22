import nodemailer from "nodemailer";

export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST);
}

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

export async function sendMail(
  to: string,
  subject: string,
  html: string,
  attachments?: { filename: string; path: string; cid: string }[]
) {
  if (!isSmtpConfigured()) {
    throw new Error("SMTP yapılandırılmadı.");
  }
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? "Puantaj Sistemi <bildirim@ajansadi.com>",
    to,
    subject,
    html,
    attachments,
  });
}
