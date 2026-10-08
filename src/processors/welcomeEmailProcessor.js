import db from "../config/database/models/postgre-models/index.js";
import { sendMailNotification } from "../service/mailNotification.service.js";
import { WELCOME_EMAIL_BODY } from "../seeder/seed-notification-template.js";

export function register(queue) {
  queue.process("welcomeEmail", async (job) => {
    const { leadsId, builderId, companyId, userId } = job.data;
    const { Leads, Builder, NotificationTemplate } = db;

    const lead = await Leads.findByPk(leadsId);
    if (!lead) {
      throw new Error(`Lead ${leadsId} not found`);
    }

    if (!lead.email) {
      console.log(`[WelcomeEmailWorker] Lead ${leadsId} has no email — skipping`);
      return { success: true, skipped: true };
    }

    const builder = await Builder.findByPk(builderId);
    const builderName = builder?.name || "InBuildify";

    await NotificationTemplate.findOrCreate({
      where: {
        builder_id: builderId,
        template_type: "WELCOME_EMAIL",
      },
      defaults: {
        company_id: companyId || null,
        builder_id: builderId,
        notification_type: "EMAIL",
        template_type: "WELCOME_EMAIL",
        title: "Welcome to {{builderName}}!",
        body: WELCOME_EMAIL_BODY,
        is_active: true,
      },
    });

    const context = {
      leadName: lead.name || "Valued Customer",
      builderName,
    };

    const plainText =
      `Dear ${context.leadName},\n\n` +
      `Thank you for your interest in building with ${builderName}. ` +
      "We are thrilled to have the opportunity to work with you.\n\n" +
      `Best regards,\nThe ${builderName} Team`;

    await sendMailNotification({
      templateType: "WELCOME_EMAIL",
      builderId,
      companyId,
      to: lead.email,
      context,
      metadata: {
        leadsId,
        type: "welcome_email",
      },
      senderId: userId || null,
      plainText,
    });

    console.log(
      `[WelcomeEmailWorker] Sent welcome email to ${lead.email} for lead ${leadsId}`,
    );
    return { success: true, email: lead.email };
  });

  queue.on("failed", async (job, err) => {
    if (job.name !== "welcomeEmail") {
      return;
    }
    const { leadsId, userId } = job.data;
    console.error(
      `[WelcomeEmailWorker] Job ${job.id} failed for lead ${leadsId}:`,
      err.message,
    );

    if (job.attemptsMade >= job.opts.attempts) {
      try {
        const { Notifications } = db;
        await Notifications.create({
          sender_id: userId || null,
          receiver_info: JSON.stringify({ leadsId }),
          template_id: null,
          notification_type: "EMAIL",
          title: "Welcome email delivery failed",
          body: `Failed to send welcome email for lead ${leadsId}`,
          metadata_json: JSON.stringify({ leadsId, error: err.message }),
          delivery_status: "FAILED",
          failure_reason: err.message.slice(0, 500),
        });
      } catch (logErr) {
        console.error("[WelcomeEmailWorker] Failed to log failure:", logErr.message);
      }
    }
  });

  queue.on("completed", (job, result) => {
    if (job.name !== "welcomeEmail") {
      return;
    }
    console.log(`[WelcomeEmailWorker] Job ${job.id} completed:`, result);
  });

  console.log("Welcome email worker started on notificationQueue...");
}
