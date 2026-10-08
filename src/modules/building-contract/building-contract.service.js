import db from "../../config/database/models/postgre-models/index.js";
import { generatePDF } from "../quotation/pdf.service.js";
import { uploadFile } from "../../service/s3.service.js";
import {
  upsertBuildingContractDriveFile,
  getBuildingContractPresignedUrl,
} from "../../helper/buildingContractDriveFile.helper.js";
import { buildingContractHtml } from "../../templates/buildingContractPdf.template.js";
import { withStageKeys } from "../../helper/buildingContract.helper.js";

/**
 * Create or update a building contract for a job.
 * Uses findOne + create/update to avoid relying on ON CONFLICT constraints.
 */
export async function upsertBuildingContract({ jobId, builderId, companyId, data, uploadedBy }) {
  const { BuildingContract } = db.sequelize.models;

  const payload = withStageKeys(data);
  const existing = await BuildingContract.findOne({ where: { job_id: jobId } });

  let result;
  if (existing) {
    await existing.update({
      builder_id: builderId,
      company_id: companyId,
      ...payload,
    });
    result = existing;
  } else {
    result = await BuildingContract.create({
      job_id: jobId,
      builder_id: builderId,
      company_id: companyId,
      ...payload,
    });
  }

  // Ensure DriveFile and S3 key are updated with the latest PDF on every save
  try {
    await generateAndStorePdf(result.building_contract_id, {
      builderId: builderId ?? result.builder_id,
      companyId: companyId ?? result.company_id,
      uploadedBy,
    });
  } catch (err) {
    console.error("Error auto-generating PDF on contract upsert:", err);
  }

  return result;
}

/**
 * Fetch a building contract by job_id. Returns null if not found.
 */
export async function getBuildingContractByJobId(jobId) {
  const { BuildingContract } = db.sequelize.models;
  return BuildingContract.findOne({ where: { job_id: jobId } });
}

/**
 * Generate PDF from saved contract data, upload to S3, store in DriveFile,
 * and return a presigned URL for viewing.
 */
export async function generateAndStorePdf(contractId, { builderId, companyId, uploadedBy } = {}) {
  const { BuildingContract } = db.sequelize.models;
  const contract = await BuildingContract.findByPk(contractId);
  if (!contract) throw Object.assign(new Error("Building contract not found"), { status: 404 });

  const html = buildingContractHtml(contract.toJSON());
  const pdfBuffer = await generatePDF(html);

  const s3Key = `building-contracts/${contractId}/building-contract-${Date.now()}.pdf`;
  await uploadFile(s3Key, pdfBuffer, "application/pdf");

  await upsertBuildingContractDriveFile({
    contractId,
    s3Key,
    size: pdfBuffer.length,
    originalName: "Building Contract.pdf",
    companyId: companyId ?? contract.company_id,
    builderId: builderId ?? contract.builder_id,
    uploadedBy,
  });

  const url = await getBuildingContractPresignedUrl(contractId);
  return { url, s3Key };
}
