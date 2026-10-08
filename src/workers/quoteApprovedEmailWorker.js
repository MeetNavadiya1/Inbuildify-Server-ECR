import Bull from "bull";
import { env } from "../config/env.config.js";
import db from "../config/database/models/postgre-models/index.js";
import { sendMailNotification } from "../service/mailNotification.service.js";
import { grandTotalSql } from "../utils/quotationTotals.sql.js";

import { bullQueueOptions } from "../config/redisBull.config.js";

const quoteApprovedEmailQueue = new Bull("quoteApprovedEmailQueue", bullQueueOptions());

quoteApprovedEmailQueue.process(async (job) => {
  const { quotationVersionId, versionId, envelopeId } = job.data;
  const qvId = quotationVersionId || versionId;

  // Fetch quotation + lead + property + structural engineer in one query
  const query = `
    SELECT
        qv.quotation_version_id,
        qv.quotation_version_no,
        q.reference_number        AS quote_reference,
        ${grandTotalSql("qv.quotation_version_id", "qv")} AS grand_total,
        l.leads_id,
        l.name                    AS lead_name,
        l.email                   AS lead_email,
        l.phone                   AS lead_phone,
        l.reference_number        AS lead_reference,
        l.builder_id,
        l.company_id,
        se.structure_engineer_id,
        se.name                   AS engineer_name,
        se.email                  AS engineer_email,
        se.phone                  AS engineer_phone,
        pd.lot_number,
        pd.street,
        pd.address_line1,
        pd.address_line2,
        pd.city,
        pd.zip_code,
        pd.width_m,
        pd.depth_m,
        pd.total_size_m2,
        pd.land_type,
        st.name                   AS state_name
     FROM quotation_version qv
     JOIN quotation q ON qv.quotation_id = q.quotation_id
     JOIN leads l ON q.leads_id = l.leads_id
     -- The engineer hangs off the quotation version, not the lead. Leads carried
     -- a structure_engineer_id until migration 20260424180500 dropped it; the
     -- column moved to quotation_version in 20260409052431 so each version can
     -- name its own engineer. Joining from l here raised
     -- "column l.structure_engineer_id does not exist" on every approved quote.
     LEFT JOIN structure_engineer se ON qv.structure_engineer_id = se.structure_engineer_id
     LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
     LEFT JOIN state st ON pd.state_id = st.state_id
     WHERE qv.quotation_version_id = :qvId
  `;
  const results = await db.sequelize.query(query, {
    replacements: { qvId },
    type: db.Sequelize.QueryTypes.SELECT
  });

  if (results.length === 0) throw new Error(`Quotation version ${qvId} not found`);
  const row = results[0];

  if (!row.engineer_email) {
    console.log(
      `[QuoteApprovedEmailWorker] No structural engineer email on version ${qvId} — skipping`
    );
    return { success: true, skipped: true };
  }

  // Lead contacts
  const contactsQuery = `
    SELECT u.name, u.email, u.phone
    FROM leads_contact_map lcm
    JOIN users u ON lcm.contact_id = u.users_id
    WHERE lcm.leads_id = :leadsId
  `;
  const contacts = await db.sequelize.query(contactsQuery, {
    replacements: { leadsId: row.leads_id },
    type: db.Sequelize.QueryTypes.SELECT
  });

  const contactsHtml =
    contacts.length > 0
      ? contacts
        .map(
          (c) =>
            `<tr>
               <td style="padding:6px 12px;border-bottom:1px solid #eee;">${c.name || "-"}</td>
               <td style="padding:6px 12px;border-bottom:1px solid #eee;">${c.email || "-"}</td>
               <td style="padding:6px 12px;border-bottom:1px solid #eee;">${c.phone || "-"}</td>
             </tr>`
        )
        .join("")
      : "<tr><td colspan=\"3\" style=\"padding:6px 12px;color:#888;\">No contacts</td></tr>";

  const propertyAddress = [
    row.address_line1,
    row.address_line2,
    row.city,
    row.state_name,
    row.zip_code,
  ]
    .filter(Boolean)
    .join(", ") || "N/A";

  const context = {
    engineerName: row.engineer_name || "Structural Engineer",
    quoteReference: row.quote_reference,
    quoteVersion: row.quotation_version_no,
    grandTotal: row.grand_total !== null ? `$${Number(row.grand_total).toFixed(2)}` : "N/A",
    leadName: row.lead_name,
    leadReference: row.lead_reference,
    leadEmail: row.lead_email || "N/A",
    leadPhone: row.lead_phone || "N/A",
    propertyAddress,
    lotNumber: row.lot_number || "N/A",
    propertyStreet: row.street || "N/A",
    propertyDimensions: row.width_m && row.depth_m
      ? `W: ${row.width_m}m  D: ${row.depth_m}m  Total: ${row.total_size_m2 || "-"}m²`
      : "N/A",
    landType: row.land_type || "N/A",
    contactsHtml,
  };

  const plainText =
    `Dear ${context.engineerName},\n\n` +
    `Quote ${context.quoteReference} (v${context.quoteVersion}) has been approved.\n\n` +
    `Lead: ${context.leadName} (${context.leadEmail})\n` +
    `Property: ${propertyAddress}\n` +
    `Total: ${context.grandTotal}`;

  await sendMailNotification({
    templateType: "QUOTE_ACCEPTED",
    builderId: row.builder_id,
    companyId: row.company_id,
    to: row.engineer_email,
    context,
    metadata: {
      quotationVersionId: qvId,
      envelopeId,
      leadsId: row.leads_id,
      quoteReference: row.quote_reference,
    },
    senderId: null,
    plainText,
  });

  console.log(
    `[QuoteApprovedEmailWorker] Sent to ${row.engineer_email} for quote ${row.quote_reference}`
  );
  return { success: true, engineerEmail: row.engineer_email };
});

quoteApprovedEmailQueue.on("failed", async (job, err) => {
  console.log("🚀 ~ quoteApprovedEmailWorker.js:159 ~ job:", job.data);
  const { quotationVersionId, versionId } = job.data;
  const qvId = quotationVersionId || versionId;
  console.error(
    `[QuoteApprovedEmailWorker] Job ${job.id} failed for version ${qvId}:`,
    err.message
  );

  if (job.attemptsMade >= job.opts.attempts) {
    try {
      const { Notifications } = db;
      await Notifications.create({
        sender_id: null,
        receiver_info: JSON.stringify({ quotationVersionId: qvId }),
        template_id: null,
        notification_type: "EMAIL",
        title: "Quote approved — structural engineer email failed",
        body: `Failed to send approval email for version ${qvId}`,
        metadata_json: JSON.stringify({ quotationVersionId: qvId, error: err.message }),
        delivery_status: "FAILED",
        failure_reason: err.message.slice(0, 500),
      });
    } catch (logErr) {
      console.error("[QuoteApprovedEmailWorker] Failed to log failure:", logErr.message);
    }
  }
});

quoteApprovedEmailQueue.on("completed", (job, result) => {
  console.log(`[QuoteApprovedEmailWorker] Job ${job.id} completed:`, result);
});

console.log("Quote approved email worker started...");

export default quoteApprovedEmailQueue;
