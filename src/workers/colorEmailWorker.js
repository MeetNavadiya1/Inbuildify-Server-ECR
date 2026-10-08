import db from "../config/database/models/postgre-models/index.js";
import { uploadFile } from "../service/s3.service.js";
import { generatePDF } from "../modules/quotation/pdf.service.js";
import { generateColorPdfHTML } from "../utils/colorPdfTemplate.js";
import notificationQueue from "./notificationWorker.js";
import { resolveItemImageBase64, resolveUnitsByItemId } from "../modules/color-item/color-item.service.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { resolveByItemId } from "../modules/color/color-table-router.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LOGO_BASE64 = (() => {
  try {
    const buf = readFileSync(join(__dirname, "../assets/logo-full.png"));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
})();

notificationQueue.process("colorEmail", async (job) => {
  const { itemIds, jobId, jobInfo = {}, emailData = {}, userId, showImage = true, showPrice = true } = job.data;
  const models = itemIds?.length > 0 ? await resolveByItemId(itemIds[0]) : db;
  const { ColorItem, ColorCategory, Color } = models;
  const { Notifications } = db;

  // 1. Resolve recipients
  const toList = (Array.isArray(emailData.to) ? emailData.to : [emailData.to])
    .filter((e) => typeof e === "string" && e.trim())
    .map((e) => e.trim());
  const ccList = (Array.isArray(emailData.cc) ? emailData.cc : [])
    .filter((e) => typeof e === "string" && e.trim())
    .map((e) => e.trim());

  if (toList.length === 0) {
    throw new Error("No valid recipient email addresses provided");
  }

  // 2. Fetch color items with categories and images
  const items = await ColorItem.findAll({
    where: { color_item_id: itemIds },
    include: [
      {
        model: ColorCategory,
        as: "colorCategory",
        attributes: ["color_category_id", "category_name"],
        include: [{ model: Color, as: "color", attributes: ["color_id", "color_name"] }],
      },
    ],
  });

  // Same fallback as the Preview path: the colour items themselves know which
  // job they belong to, so a job id missing from the queued payload does not
  // cost every row its quantity.
  const effectiveJobId = jobId || items.find((i) => i.get("job_id"))?.get("job_id") || null;
  const unitByItemId = await resolveUnitsByItemId(effectiveJobId);

  const itemsPlain = await Promise.all(
    items.map(async (item) => {
      const plain = item.get({ plain: true });
      const imageBase64 = await resolveItemImageBase64(plain.color_image);

      return {
        colorItemId: plain.color_item_id,
        itemName: plain.item_name,
        itemCode: plain.item_code,
        costType: plain.cost_type,
        cost: plain.cost,
        unit: unitByItemId[plain.color_item_id] ?? null,
        units: plain.units,
        description: plain.description,
        features: plain.features,
        colorCategory: plain.colorCategory
          ? { name: plain.colorCategory.category_name }
          : null,
        _imageBase64: imageBase64,
      };
    })
  );

  // 3. Generate color selection summary PDF and upload to S3
  const html = generateColorPdfHTML({ items: itemsPlain, jobInfo, logoBase64: LOGO_BASE64, showImage, showPrice });
  const pdfBuffer = await generatePDF(html);

  const safeRef = (jobInfo.referenceNumber || jobId || "summary").replace(/[^a-zA-Z0-9_-]/g, "_");
  const s3Key = `color-selections/${jobId || "general"}/Colour_Selection_${safeRef}.pdf`;
  const uploadResult = await uploadFile(s3Key, pdfBuffer, "application/pdf");
  if (!uploadResult?.success) {
    throw new Error("Failed to upload Colour Selection PDF");
  }

  // 4. Queue email to the default mail queue processor
  const plainText = (emailData.message || "").replace(/<[^>]*>/g, "");
  await notificationQueue.add(
    {
      to: toList,
      subject: emailData.subject,
      text: plainText,
      html: emailData.message,
      attachments: [],
      cc: ccList.length > 0 ? ccList : null,
      attachmentKeys: [
        { key: s3Key, filename: `Colour_Selection_${safeRef}.pdf`, contentType: "application/pdf" },
      ],
    },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: true,
      removeOnFail: 50,
    }
  );

  // 5. Log notification
  await Notifications.create({
    sender_id: userId || null,
    receiver_info: JSON.stringify({ to: toList, cc: ccList }),
    template_id: null,
    notification_type: "EMAIL",
    title: emailData.subject,
    body: `Colour Selection sent to ${toList.join(", ")} for job ${jobInfo.referenceNumber || jobId}`,
    metadata_json: JSON.stringify({ jobId, to: toList, cc: ccList, s3Key }),
    delivery_status: "SENT",
  });

  console.log(`[ColorEmailWorker] Job complete — jobId: ${jobId}, to: ${toList.join(", ")}`);
  return { success: true, to: toList };
});

notificationQueue.on("failed", async (job, err) => {
  if (job.name !== "colorEmail") return;
  const { jobId, userId } = job.data;
  console.error(`[ColorEmailWorker] Job ${job.id} failed for jobId ${jobId}:`, err.message);

  if (job.attemptsMade >= job.opts.attempts) {
    try {
      const { Notifications } = db;
      await Notifications.create({
        sender_id: userId || null,
        receiver_info: JSON.stringify({ jobId }),
        template_id: null,
        notification_type: "EMAIL",
        title: "Colour Selection email delivery failed",
        body: `Failed to send Colour Selection for job ${jobId}`,
        metadata_json: JSON.stringify({ jobId, error: err.message }),
        delivery_status: "FAILED",
        failure_reason: err.message.slice(0, 500),
      });
    } catch (logErr) {
      console.error("[ColorEmailWorker] Failed to log failure to notifications table:", logErr.message);
    }
  }
});

notificationQueue.on("completed", (job, result) => {
  if (job.name !== "colorEmail") return;
  console.log(`[ColorEmailWorker] Job ${job.id} completed:`, result);
});

console.log("Colour selection email worker registered on notificationQueue...");

export default notificationQueue;
