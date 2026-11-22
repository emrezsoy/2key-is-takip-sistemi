import path from "node:path";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const LOGO_PATH = path.resolve(process.cwd(), "public/brand/logo.png");

const COLORS = {
  ink: "#0a0a0a",
  red: "#f01c26",
  redDark: "#ca131c",
  text: "#171717",
  textMuted: "#6b6b6b",
  border: "#e6e6e6",
  bg: "#f2f2f3",
  surface: "#ffffff",
};

type InfoRow = { label: string; value: string };

// Sistemde kullandığımız fontlarla aynı: gövde için Inter, imza için Playfair
// Display italic (bkz. src/app/layout.tsx ve src/app/giris/page.tsx). E-posta
// istemcileri web fontlarını tutarsız destekler; bu yüzden hem Google Fonts
// linki veriyoruz (destekleyen istemcide gerçek font yüklenir) hem de aynı
// karaktere en yakın sistem fontlarını fallback olarak sıralıyoruz.
const FONT_SANS =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const FONT_SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";

/**
 * Tüm bildirim maillerinin paylaştığı marka şablonu: koyu üstte logo (cid ile
 * gömülü, harici barındırma gerekmez), kırmızı vurgu çizgisi, içerik alanı,
 * opsiyonel bilgi tablosu, CTA butonu ve alt marka imzası.
 */
export function renderNotificationEmail(params: {
  preheader: string;
  heading: string;
  greeting: string;
  message: string;
  infoRows?: InfoRow[];
  ctaLabel?: string;
}) {
  const { preheader, heading, greeting, message, infoRows, ctaLabel = "Panele git" } = params;

  const infoTable =
    infoRows && infoRows.length > 0
      ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-top:1px solid ${COLORS.border};padding-top:16px;">
          ${infoRows
            .map(
              (row) => `
            <tr>
              <td style="padding:4px 0;font-size:13px;color:${COLORS.textMuted};width:120px;vertical-align:top;font-family:${FONT_SANS};">${row.label}</td>
              <td style="padding:4px 0;font-size:13px;color:${COLORS.text};font-weight:600;vertical-align:top;font-family:${FONT_SANS};">${row.value}</td>
            </tr>`
            )
            .join("")}
        </table>`
      : "";

  const html = `
<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!--[if !mso]><!-->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Playfair+Display:ital,wght@1,700&display=swap"
      rel="stylesheet"
    />
    <!--<![endif]-->
  </head>
  <body style="margin:0;padding:0;background:${COLORS.bg};font-family:${FONT_SANS};">
    <span style="display:none;font-size:1px;color:${COLORS.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
      ${preheader}
    </span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:${COLORS.surface};border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:${COLORS.ink};padding:24px 32px;">
                <img src="cid:logo" alt="2 Key idea" height="30" style="display:block;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 8px;">
                <div style="width:36px;height:4px;background:${COLORS.red};border-radius:2px;margin-bottom:18px;"></div>
                <h1 style="margin:0 0 14px;font-size:19px;line-height:1.4;color:${COLORS.text};font-family:${FONT_SANS};">${heading}</h1>
                <p style="margin:0 0 6px;font-size:14px;color:${COLORS.textMuted};font-family:${FONT_SANS};">${greeting}</p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:${COLORS.text};font-family:${FONT_SANS};">${message}</p>
                ${infoTable}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px;">
                <a href="${APP_URL}" style="display:inline-block;background:${COLORS.red};color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;font-family:${FONT_SANS};">
                  ${ctaLabel}
                </a>
              </td>
            </tr>
            <tr>
              <td style="background:${COLORS.bg};padding:18px 32px;border-top:1px solid ${COLORS.border};">
                <p style="margin:0;font-size:14px;color:#8a8a8a;font-style:italic;font-family:${FONT_SERIF};">Aynı Dünya Farklı Fikir</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    html,
    attachments: [{ filename: "logo.png", path: LOGO_PATH, cid: "logo" }],
  };
}
