import db from "../config/database/models/postgre-models/index.js";
import { sendMailNotification } from "../service/mailNotification.service.js";
import notificationQueue from "./notificationWorker.js";

const APPOINTMENT_REMINDER_BODY = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
    <div style="background:#0056b3;color:#ffffff;padding:24px 30px;text-align:center;">
      <h1 style="margin:0;font-size:24px;">Upcoming Appointment</h1>
    </div>
    <div style="padding:30px;line-height:1.6;color:#333333;">
      <p>Dear {{customerName}},</p>
      <p>This is a confirmation about your upcoming appointment with <strong>{{builderName}}</strong>.</p>
      <table style="width:100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold; width: 30%;">Title:</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">{{title}}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">Date:</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">{{date}}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">Time:</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">{{startTime}} - {{endTime}}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">Location:</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">{{locationText}}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">Notes:</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">{{notes}}</td>
        </tr>
      </table>
      <p>If you need to reschedule or have any questions, please contact us as soon as possible.</p>
      <p style="margin-top:25px;">Best regards,<br><strong>The {{builderName}} Team</strong></p>
    </div>
    <div style="background:#f1f1f1;padding:15px;text-align:center;font-size:12px;color:#777777;">
      This is an automated message. Please do not reply directly to this email.
    </div>
  </div>
</body>
</html>`;

notificationQueue.process("appointmentEmail", async (job) => {
  const { appointmentId, leadId, builderId, companyId, userId } = job.data;
  const { Appointment, Leads, Builder, NotificationTemplate } = db;

  // 1. Fetch appointment details
  const appointment = await Appointment.findByPk(appointmentId);
  if (!appointment) throw new Error(`Appointment ${appointmentId} not found`);

  // 2. Fetch lead details
  const lead = await Leads.findByPk(leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);
  if (!lead.email) {
    console.log(`[AppointmentEmailWorker] Lead ${leadId} has no email — skipping`);
    return { success: true, skipped: true };
  }

  // 3. Fetch builder name
  const builder = builderId ? await Builder.findByPk(builderId) : null;
  const builderName = builder?.name || "InBuildify";

  // 4. Ensure APPOINTMENT_REMINDER template exists for this builder/company (self-healing)
  const templateScope = {};
  if (builderId) {
    templateScope.builder_id = builderId;
  } else if (companyId) {
    templateScope.company_id = companyId;
  }
  templateScope.template_type = "APPOINTMENT_REMINDER";

  await NotificationTemplate.findOrCreate({
    where: templateScope,
    defaults: {
      company_id: companyId || null,
      builder_id: builderId || null,
      notification_type: "EMAIL",
      template_type: "APPOINTMENT_REMINDER",
      title: "Appointment booked: {{title}} for {{customerName}}",
      body: APPOINTMENT_REMINDER_BODY,
      is_active: true,
    },
  });

  // 5. Send via sendMailNotification
  const context = {
    customerName: lead.name || "Valued Customer",
    builderName,
    title: appointment.title,
    date: appointment.date,
    startTime: appointment.start_time,
    endTime: appointment.end_time,
    locationText: appointment.location_text || "N/A",
    notes: appointment.notes || "N/A",
  };

  const plainText = `Dear ${context.customerName}, this is a confirmation about your upcoming appointment: ${appointment.title} on ${appointment.date} at ${appointment.start_time}.`;

  await sendMailNotification({
    templateType: "APPOINTMENT_REMINDER",
    builderId,
    companyId,
    to: lead.email,
    context,
    metadata: {
      appointmentId,
      leadsId: leadId,
      type: "appointment_reminder",
    },
    senderId: userId || null,
    plainText,
  });

  console.log(`[AppointmentEmailWorker] Sent appointment email to ${lead.email} for appointment ${appointmentId}`);
  return { success: true, email: lead.email };
});

notificationQueue.on("failed", async (job, err) => {
  if (job.name !== "appointmentEmail") return;
  const { appointmentId, userId } = job.data;
  console.error(`[AppointmentEmailWorker] Job ${job.id} failed for appointmentId ${appointmentId}:`, err.message);

  // Log failure to notifications table if all retries exhausted
  if (job.attemptsMade >= job.opts.attempts) {
    try {
      const { Notifications } = db;
      await Notifications.create({
        sender_id: userId || null,
        receiver_info: JSON.stringify({ appointmentId }),
        template_id: null,
        notification_type: "EMAIL",
        title: "Appointment email delivery failed",
        body: `Failed to send appointment email for appointment ${appointmentId}`,
        metadata_json: JSON.stringify({ appointmentId, error: err.message }),
        delivery_status: "FAILED",
        failure_reason: err.message.slice(0, 500),
      });
    } catch (logErr) {
      console.error("[AppointmentEmailWorker] Failed to log failure:", logErr.message);
    }
  }
});

notificationQueue.on("completed", (job, result) => {
  if (job.name !== "appointmentEmail") return;
  console.log(`[AppointmentEmailWorker] Job ${job.id} completed:`, result);
});

console.log("Appointment email worker started on notificationQueue...");

export default notificationQueue;
