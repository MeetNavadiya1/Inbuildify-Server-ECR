import nodemailer from "nodemailer";
import { env } from "./env.config.js";

const poolOptions = {
  pool: true,
  maxConnections: 3,
  maxMessages: 50,
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 180000,
};

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM,
  MAIL_REPLY_TO,
  GMAIL,
  PASSWORD,
} = env.EMAIL;

// SES credentials present -> send through SES, otherwise stay on the old Gmail
// account, so an environment that has not been switched over keeps working.
const useSmtp = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

if (useSmtp && !MAIL_FROM) {
  throw new Error(
    "MAIL_FROM is required when SMTP_HOST/SMTP_USER/SMTP_PASS are set: SES rejects any From address that is not a verified identity.",
  );
}

const transportOptions = useSmtp
  ? {
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: false,
    requireTLS: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    ...poolOptions,
  }
  : {
    service: "Gmail",
    auth: { user: GMAIL, pass: PASSWORD },
    ...poolOptions,
  };

export const createMailTransport = () => nodemailer.createTransport(transportOptions);

export const mailFrom = MAIL_FROM || GMAIL;

export const mailReplyTo = MAIL_REPLY_TO || null;

export const isSesTransport = useSmtp;
