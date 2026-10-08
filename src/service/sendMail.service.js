import emailQueue from "../queues/emailQueue.js";
import { createMailTransport, mailFrom, mailReplyTo } from "../config/mailTransport.js";
import { getObject } from "./s3.service.js";

const sendEmail = async (
  to,
  subject,
  text,
  html = null,
  attachments = [],
  cc = null,
  attachmentKeys = [],
) => {
  try {
    await emailQueue.add(
      "notification",
      {
        to,
        subject,
        text,
        html,
        attachments,
        cc,
        attachmentKeys,
      },
      {
        // Retry transient delivery failures (SMTP "Connection timeout", brief
        // Gmail throttling) instead of dropping the email on the first error.
        attempts: 3,
        backoff: { type: "exponential", delay: 10000 },
        // Prevent Redis OOM: don't keep completed jobs; cap failed history.
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );

    return {
      success: true,
      message: "Email queued successfully",
    };
  } catch (error) {
    console.error("Error queuing email:", error.message);
    throw error;
  }
};

const directTransporter = createMailTransport();

/**
 * Send an email RIGHT NOW, in the caller's request, instead of queuing it to
 * Bull/Redis. The shared Redis Cloud queue is consumed by whichever worker
 * (across any machine) grabs the job first, so a queued engineer email could be
 * silently picked up and dropped by a competing/stale worker — the API would
 * still report success because queuing succeeded. Sending directly guarantees
 * the caller only sees success when Gmail actually accepts the message, and any
 * real SMTP/attachment failure propagates back instead of vanishing.
 *
 * Resolves S3 attachmentKeys (the same shape the worker accepts) into real
 * attachment buffers before sending.
 *
 * @returns {Promise<{success: boolean, messageId?: string, accepted?: string[], message?: string}>}
 */
export const sendEmailNow = async (
  to,
  subject,
  text,
  html = null,
  attachments = [],
  cc = null,
  attachmentKeys = [],
) => {
  const resolvedAttachments = Array.isArray(attachments) ? [...attachments] : [];

  for (const item of attachmentKeys) {
    if (!item?.key) continue;
    const obj = await getObject(item.key);
    if (obj?.success && obj?.data) {
      resolvedAttachments.push({
        filename: item.filename,
        content: obj.data,
        contentType: item.contentType || obj.contentType || "application/octet-stream",
      });
    } else {
      // A missing attachment must fail loudly — an engineer email without the
      // Engineering Requirement PDF is not a successful send.
      throw new Error(
        `Failed to fetch email attachment "${item.filename}" (${item.key}): ${obj?.error || "no data"}`,
      );
    }
  }

  const mailOptions = {
    from: mailFrom,
    ...(mailReplyTo ? { replyTo: mailReplyTo } : {}),
    to,
    ...(cc && cc.length > 0 ? { cc } : {}),
    subject,
    text,
    html,
    attachments: resolvedAttachments,
  };

  const info = await directTransporter.sendMail(mailOptions);

  if (info.accepted && info.accepted.length > 0) {
    return {
      success: true,
      messageId: info.messageId,
      accepted: info.accepted,
    };
  }

  throw new Error(`Email not accepted for ${to}`);
};

export default sendEmail;
