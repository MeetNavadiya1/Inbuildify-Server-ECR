import db from "../config/database/models/postgre-models/index.js";
import quotationRepository from "../modules/quotation/quotation.repository.js";
import { generatePDF } from "../modules/quotation/pdf.service.js";
import { generateQuotationHTML } from "../utils/template.js";
import { inlineQuotationPdfImages } from "../utils/quotationPdfImages.js";
import { uploadFile } from "../service/s3.service.js";
import { Op } from "sequelize";

async function process(job) {
  const { quotation_version_id, builder_id, company_id } = job.data;
  const { QuotationVersion, Quotation, Leads } = db;

  console.log(`[PDFWorker] Starting generation for version: ${quotation_version_id}`);

  const existingPdf = await quotationRepository.getPdfUrl(quotation_version_id);
  if (existingPdf) {
    console.log(`[PDFWorker] PDF already exists for version: ${quotation_version_id}, skipping generation.`);
    return { success: true, s3Key: existingPdf };
  }

  const sourceVersion = await QuotationVersion.findOne({
    where: { quotation_version_id },
    include: [{
      model: Quotation,
      as: "quotation",
      include: [{
        model: Leads,
        as: "lead",
        where: {
          [Op.or]: [
            { builder_id },
            ...(company_id ? [{ company_id }] : []),
          ],
        },
      }],
    }],
  });

  if (!sourceVersion) {
    throw new Error(`Quotation version ${quotation_version_id} not found or unauthorized`);
  }

  const versionDetails = await quotationRepository.getQuotationVersionDetailsById(quotation_version_id);
  if (!versionDetails) {
    throw new Error(`Details not found for version ${quotation_version_id}`);
  }

  await inlineQuotationPdfImages(versionDetails);
  const htmlContent = generateQuotationHTML(versionDetails);
  const pdfBuffer = await generatePDF(htmlContent);

  console.log(`[PDFWorker] PDF generated for ${quotation_version_id}, size: ${pdfBuffer.length} bytes`);

  const fileName = `Quotation_v${versionDetails.quotationVersionNo}_${versionDetails.quotationId}.pdf`;
  const s3Key = `quotations/${quotation_version_id}/${fileName}`;

  const uploadResult = await uploadFile(s3Key, pdfBuffer, "application/pdf");

  if (!uploadResult.success) {
    throw new Error(`Failed to upload PDF to S3: ${uploadResult.error}`);
  }

  await quotationRepository.updatePdfUrl(quotation_version_id, uploadResult.key, {
    size: pdfBuffer.length,
    originalName: fileName,
  });

  console.log(`[PDFWorker] Job complete — versionId: ${quotation_version_id}, key: ${uploadResult.key}`);

  return { success: true, s3Key: uploadResult.key, location: uploadResult.location };
}

export function register(queue) {
  queue.process("pdfGeneration", process);

  queue.on("failed", (job, err) => {
    if (job.name !== "pdfGeneration") return;
    console.error(`[PDFWorker] Job ${job.id} failed for versionId ${job.data.quotation_version_id}:`, err.message);
  });

  queue.on("completed", (job) => {
    if (job.name !== "pdfGeneration") return;
    console.log(`[PDFWorker] Job ${job.id} completed successfully`);
  });

  console.log("Quotation PDF generation worker started...");
}
