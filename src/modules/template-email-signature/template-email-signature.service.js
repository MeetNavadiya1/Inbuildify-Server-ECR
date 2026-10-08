import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";

/* ---------------------------------
   GET TEMPLATE EMAIL SIGNATURE
---------------------------------- */
export async function getTemplateEmailSignatureService({ builderId, companyId, userId }) {
  const orConditions = [];

  if (builderId) {
    // Ensuring builder_id IS NOT NULL AND builder_id = $1 logic from previous raw sql
    orConditions.push({ builder_id: builderId });
  }

  if (companyId) {
    orConditions.push({ company_id: companyId });
  }

  if (orConditions.length === 0) {
    const error = new Error("builderId or companyId is required");
    error.status = 400;
    throw error;
  }

  let signature = await db.TemplateEmailSignature.findOne({
    where: {
      [Op.or]: orConditions,
    },
  });

  let created = false;
  if (!signature) {
    signature = await db.TemplateEmailSignature.create({
      builder_id: builderId || null,
      company_id: companyId || null,
      include_email_signature: false,
      signature_content: "",
      created_by: userId,
      updated_by: userId,
    });
    created = true;
  }

  return {
    signature: keysToCamelCase(signature.toJSON()),
    created,
  };
}

/* ---------------------------------
   UPDATE TEMPLATE EMAIL SIGNATURE
---------------------------------- */
export async function updateTemplateEmailSignatureService({
  builderId,
  companyId,
  userId,
  payload,
}) {
  let { include_email_signature, signature_content } = payload;

  if (typeof include_email_signature === "string") {
    include_email_signature = include_email_signature.toLowerCase() === "true";
  }

  const orConditions = [];
  if (builderId) {
    orConditions.push({ builder_id: builderId });
  }
  if (companyId) {
    orConditions.push({ company_id: companyId });
  }

  if (orConditions.length === 0) {
    const error = new Error("No template email signatures found or you are not authorized to update them.");
    error.status = 404;
    throw error;
  }

  const signatures = await db.TemplateEmailSignature.findAll({
    where: { [Op.or]: orConditions },
  });

  if (signatures.length === 0) {
    const error = new Error("No template email signatures found or you are not authorized to update them.");
    error.status = 404;
    throw error;
  }

  if (
    signatures.some((record) => record.include_email_signature === false) &&
    signature_content !== undefined &&
    (include_email_signature === undefined || include_email_signature === false)
  ) {
    const error = new Error("You cannot update signature content when include_email_signature is disabled.");
    error.status = 400;
    throw error;
  }

  if (include_email_signature === false) {
    signature_content = null;
  }

  const targetSignature = signatures[0];

  const curr_include = include_email_signature !== undefined ? include_email_signature : targetSignature.include_email_signature;

  let new_signature_content;
  if (curr_include === false) {
    new_signature_content = null;
  } else if (signature_content !== undefined && signature_content !== null) {
    new_signature_content = signature_content.trim();
  } else {
    new_signature_content = targetSignature.signature_content;
  }

  await db.TemplateEmailSignature.update({
    include_email_signature: curr_include,
    signature_content: new_signature_content,
    updated_by: userId,
    updated_at: new Date(),
  }, {
    where: {
      [Op.or]: orConditions,
    },
  });

  return keysToCamelCase({
    include_email_signature: curr_include,
    signature_content: new_signature_content,
  });
}
