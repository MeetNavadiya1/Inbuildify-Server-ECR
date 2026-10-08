import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";
import { seedInitialPdfTemplates } from "../../seeder/template-pdf.seed.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";
import { getFormatValidationSchema } from "./template-pdf.validation.js";

function mergeTemplateImages(base, payload) {
  const result = { ...base };

  if (payload.logo_image) {
    result.logo_image = payload.logo_image;
  }

  if (payload.watermark_image) {
    result.watermark_image = payload.watermark_image;
  }

  return result;
}

function resolveScope(user) {
  return {
    company_id: user.company_id || null,
    builder_id: user.builder_id || null,
  };
}

export async function createTemplatePdf(user, payload) {
  const templateJson = mergeTemplateImages({}, payload);

  const template = await db.TemplatePdf.create({
    company_id: user.company_id || null,
    builder_id: user.builder_id || null,
    name: payload.name,
    template_json: templateJson,
    created_by: user.users_id,
    updated_by: user.users_id,
  });

  return template.toJSON();
}

const formatTypeMap = {
  invoice_format: "Invoice Format",
  receipt_format: "Receipt Format",
  variation_format: "Variation Format",
  color_format: "Color Format",
  maintenance_format: "Maintenance Format",
};

export function normalizeFormatType(type) {
  if (!type) {
    return null;
  }

  const cleaned = String(type).trim();

  // Option 1: user sends "invoice_format"
  if (formatTypeMap[cleaned]) {
    return cleaned;
  }

  // Option 2: user sends "Invoice Format"
  const found = Object.entries(formatTypeMap).find(
    ([key, value]) => value.toLowerCase() === cleaned.toLowerCase(),
  );

  if (found) {
    return found[0]; // return invoice_format
  }

  return null;
}

export async function updateTemplatePdf(user, templatePdfId, formatType, payload) {
  const existing = await getTemplatePdfById(user, templatePdfId);
  if (!existing) {
    throw new Error("Template not found");
  }

  const expectedName = formatTypeMap[formatType];
  if (!expectedName) {
    throw new Error("Invalid format_type");
  }

  if (existing.name !== expectedName) {
    throw new Error(`Template is not of type ${formatType}`);
  }

  const existingJson = existing.template_json || {};
  const updatedJson = deepMergeFormatSection(existingJson, payload, formatType);

  // Delete old images if replaced
  if (
    payload.logo_image &&
    existingJson?.logo_settings?.logo_image &&
    payload.logo_image !== existingJson.logo_settings.logo_image
  ) {
    await deleteFromS3(existingJson.logo_settings.logo_image);
  }
  if (
    payload.watermark_image &&
    existingJson?.logo_settings?.watermark_image &&
    payload.watermark_image !== existingJson.logo_settings.watermark_image
  ) {
    await deleteFromS3(existingJson.logo_settings.watermark_image);
  }

  const [updatedCount, updatedRows] = await db.TemplatePdf.update(
    {
      name: payload.name ?? existing.name,
      template_json: updatedJson,
      updated_by: user.users_id,
    },
    {
      where: { template_pdf_id: templatePdfId },
      returning: true,
    },
  );

  const updatedRecord = updatedRows[0];
  return updatedRecord.get ? updatedRecord.get({ plain: true }) : updatedRecord;
}

export async function getTemplatePdfById(user, templatePdfId) {
  const { company_id, builder_id } = resolveScope(user);

  const template = await db.TemplatePdf.findOne({
    where: {
      template_pdf_id: templatePdfId,
      [Op.or]: [
        builder_id ? { builder_id } : null,
        company_id ? { company_id } : null,
      ].filter(Boolean),
    },
  });

  return template ? template.toJSON() : null;
}

export async function getTemplatePdfList(user) {
  const { company_id, builder_id } = resolveScope(user);

  const orConditions = [];
  if (company_id) {
    orConditions.push({ company_id });
  }
  if (builder_id) {
    orConditions.push({ builder_id });
  }

  if (orConditions.length === 0) {
    return [];
  }

  let records = await db.TemplatePdf.findAll({
    where: {
      [Op.or]: orConditions,
    },
    order: [["createdAt", "DESC"]],
  });

  if (records.length === 0) {
    await seedInitialPdfTemplates({
      company_id,
      builder_id,
      created_by: user.users_id,
    });

    records = await db.TemplatePdf.findAll({
      where: {
        [Op.or]: orConditions,
      },
      order: [["createdAt", "DESC"]],
    });
  }

  return records.map(r => r.toJSON());
}

/* -------------------------------------------
   PATCH-style merge for direct field updates
   ------------------------------------------- */
function getAllowedKeysFromSchema(schema) {
  const desc = schema.describe();
  return Object.keys(desc.keys || {});
}

function deepPatchMerge(target, source) {
  const output = structuredClone(target);

  for (const [key, value] of Object.entries(source)) {
    // If source value is object → deep merge
    if (value && typeof value === "object" && !Array.isArray(value)) {
      output[key] = deepPatchMerge(
        output[key] || {}, // existing sub-object
        value,
      );
    } else {
      // primitive or null → overwrite
      output[key] = value;
    }
  }

  return output;
}

function deepMergeFormatSection(existing, payload, formatType) {
  const schema = getFormatValidationSchema(formatType);
  const allowedKeys = getAllowedKeysFromSchema(schema);

  const updated = structuredClone(existing);

  for (const [key, value] of Object.entries(payload)) {
    if (!allowedKeys.includes(key)) {
      continue;
    } // whitelist check

    if (value && typeof value === "object" && !Array.isArray(value)) {
      updated[key] = deepPatchMerge(updated[key] || {}, value);
    } else {
      updated[key] = value;
    }
  }

  updated.logo_settings = updated.logo_settings || {};

  if (payload.logo_image) {
    updated.logo_settings.logo_image = payload.logo_image;
  }
  if (payload.watermark_image) {
    updated.logo_settings.watermark_image = payload.watermark_image;
  }

  return updated;
}

export default {
  createTemplatePdf,
  updateTemplatePdf,
  getTemplatePdfById,
  getTemplatePdfList,
  normalizeFormatType,
};
