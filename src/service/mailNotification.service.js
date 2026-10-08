import db from "../config/database/models/postgre-models/index.js";
import { renderTemplate } from "../utils/templateRenderer.js";
import sendEmail from "./sendMail.service.js";
import { logActivity } from "../utils/activityLogger.js";

/**
 * Common mail notification service.
 * Looks up a NotificationTemplate by templateType + builderId/companyId,
 * renders title/body, queues the email via notificationQueue,
 * and logs the result to the Notifications table.
 *
 * @param {object} opts
 * @param {string} opts.templateType   - NotificationTemplate.template_type enum value
 * @param {string} [opts.builderId]    - builder_id scope
 * @param {string} [opts.companyId]    - company_id scope (fallback if no builderId match)
 * @param {string} opts.to             - recipient email
 * @param {string|string[]} [opts.cc]  - CC email(s)
 * @param {object} [opts.context]      - {{variable}} replacements for title/body
 * @param {object} [opts.metadata]     - extra data stored in notifications.metadata_json
 * @param {string} [opts.senderId]     - users_id of sender (null for system)
 * @param {string} [opts.plainText]    - plain-text fallback for email body
 */
export async function sendMailNotification({
  templateType,
  builderId,
  companyId,
  to,
  cc = null,
  context = {},
  metadata = {},
  senderId = null,
  plainText = null,
}) {
  const { NotificationTemplate, Notifications } = db;

  const whereClause = { template_type: templateType, is_active: true };
  if (builderId) whereClause.builder_id = builderId;
  else if (companyId) whereClause.company_id = companyId;

  const notifTemplate = await NotificationTemplate.findOne({ where: whereClause });
  if (!notifTemplate) {
    throw new Error(
      `Notification template "${templateType}" not found for builder ${builderId ?? companyId}. Run seeders.`
    );
  }

  const renderedTitle = renderTemplate(notifTemplate.title, context);
  const renderedBody = renderTemplate(notifTemplate.body, context);
  const text = plainText || renderedTitle;
  const ccList = Array.isArray(cc) ? cc : cc ? [cc] : null;

  await sendEmail(to, renderedTitle, text, renderedBody, [], ccList);

  const notification = await Notifications.create({
    sender_id: senderId || null,
    receiver_info: JSON.stringify({ to, cc: ccList }),
    template_id: notifTemplate.notification_template_id,
    notification_type: "EMAIL",
    title: renderedTitle,
    body: renderedTitle.slice(0, 999),
    metadata_json: JSON.stringify(metadata),
    delivery_status: "SENT",
  });

  const leadId = metadata.leadsId || metadata.leadId || null;
  await logActivity(null, {
    userId: senderId || null,
    companyId: companyId || null,
    builderId: builderId || null,
    referenceId: leadId || notification.notifications_id,
    referenceType: leadId ? "LEAD" : "EMAIL",
    module: "Email",
    moduleId: notification.notifications_id,
    recordName: renderedTitle,
    action: "EMAIL_SENT",
    description: `Sent email: ${renderedTitle}`,
    metadata: metadata,
  });

  return notification;
}

export default { sendMailNotification };
