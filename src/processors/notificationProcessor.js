// import nodemailer from "nodemailer";
// import { env } from "../config/env.config.js";
import { createMailTransport, mailFrom, mailReplyTo } from "../config/mailTransport.js";
import { getObject } from "../service/s3.service.js";

// const transporter = nodemailer.createTransport({
//   service: "Gmail",
//   auth: {
//     user: env.EMAIL.GMAIL,
//     pass: env.EMAIL.PASSWORD,
//   },
//   pool: true,
//   maxConnections: 3,
//   maxMessages: 50,
//   connectionTimeout: 30000,
//   greetingTimeout: 30000,
//   socketTimeout: 180000,
// });
const transporter = createMailTransport();

async function process(job) {
  const { to, subject, text, html, attachments = [], cc, attachmentKeys = [] } = job.data;

  try {
    const linkRegex = /(https?:\/\/[^\s]+)/g;
    // Callers that supply their own `html` (job invoices, campaigns) pass text:
    // null — only the `html ||` fallback below consumes htmlContent.
    const htmlContent = text ? text.replace(
      linkRegex,
      "<a href=\"$1\" style=\"color: #007bff; text-decoration: none;\">$1</a>",
    ) : "";

    const resolvedAttachments = Array.isArray(attachments) ? [...attachments] : [];
    for (const item of attachmentKeys) {
      if (!item?.key) {
        continue;
      }
      try {
        const obj = await getObject(item.key);
        if (obj?.success && obj?.data) {
          resolvedAttachments.push({
            filename: item.filename,
            content: obj.data,
            contentType: item.contentType || obj.contentType || "application/octet-stream",
          });
        } else {
          console.error(`Failed to fetch S3 attachment ${item.key}: ${obj?.error || "no data"}`);
        }
      } catch (e) {
        console.error(`Error fetching S3 attachment ${item.key}:`, e.message);
      }
    }

    const mailOptions = {
      // from: env.EMAIL.GMAIL,
      from: mailFrom,
      ...(mailReplyTo ? { replyTo: mailReplyTo } : {}),
      to,
      ...(cc && cc.length > 0 ? { cc } : {}),
      subject,
      text,
      html: html || `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">${subject}</h2>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px;">
            <div style="white-space: pre-wrap; font-family: Arial, sans-serif; margin: 0;">${htmlContent}</div>
          </div>
          <p style="color: #666; font-size: 12px; margin-top: 20px;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      `,
      attachments: resolvedAttachments,
    };

    const info = await transporter.sendMail(mailOptions);

    if (info.accepted && info.accepted.length > 0) {
      return {
        success: true,
        messageId: info.messageId,
        info: info.response,
        accepted: info.accepted,
      };
    }

    console.error(`Email not accepted for ${to}`);
    throw new Error("Email not accepted");
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error.message);
    throw error;
  }
}

export function register(queue) {
  queue.process("notification", process);

  // Several processors share this queue, and queue-level listeners fire for
  // every job on it — filter to this processor's own jobs.
  queue.on("failed", (job, err) => {
    if (job.name !== "notification") return;
    console.error(`Job ${job.id} failed:`, err.message);
  });

  queue.on("completed", (job, result) => {
    if (job.name !== "notification") return;
    console.log(`Job ${job.id} completed:`, result);
  });

  console.log("Email worker started and listening for jobs...");
}
