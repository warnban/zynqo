import nodemailer from "nodemailer";

const FROM = process.env.SMTP_FROM || "noreply@zynqo.ru";
const APP_NAME = "zynqo";

export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransport() {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

/** Отправить 6-значный код подтверждения e-mail при регистрации. */
export async function sendVerificationCode(email, code) {
  const subject = `Код подтверждения — ${APP_NAME}`;
  const text = [
    `Здравствуйте!`,
    ``,
    `Ваш код подтверждения для регистрации на ${APP_NAME}: ${code}`,
    ``,
    `Код действует 15 минут. Если вы не регистрировались — проигнорируйте это письмо.`,
    ``,
    `С уважением,`,
    `Команда ${APP_NAME}`,
    `support@zynqo.ru`,
  ].join("\n");
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#111">
      <p>Здравствуйте!</p>
      <p>Ваш код подтверждения для регистрации на <strong>${APP_NAME}</strong>:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:24px 0">${code}</p>
      <p style="color:#666;font-size:14px">Код действует 15 минут. Если вы не регистрировались — проигнорируйте это письмо.</p>
      <p style="color:#999;font-size:12px;margin-top:32px">support@zynqo.ru</p>
    </div>`;

  if (!isSmtpConfigured()) {
    console.log(`[SMTP] SMTP не настроен — код для ${email}: ${code}`);
    return;
  }

  const transport = createTransport();
  await transport.sendMail({ from: FROM, to: email, subject, text, html });
}
