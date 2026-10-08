import db from "../config/database/models/postgre-models/index.js";
import pdfTemplates from "../templates/pdf-template.json" with { type: "json" };
import { keysToSnakeCase } from "../utils/common.js";

/**
 * Convert camelCase key to Title Case
 * invoiceFormat -> Invoice Format
 */
function keyToTitle(key) {
  return key
    // convert snake_case to spaces
    .replace(/[_-]/g, " ")
    // add spaces before CamelCase capitals
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    // normalize spacing
    .replace(/\s+/g, " ")
    // trim
    .trim()
    // capitalize first letter of each word
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function seedInitialPdfTemplates({
  company_id = null,
  builder_id = null,
  created_by,
  transaction,
}) {
  const { TemplatePdf } = db;

  if (!company_id && !builder_id) {
    throw new Error("Either company_id or builder_id is required");
  }

  for (const [key, templateJson] of Object.entries(pdfTemplates)) {
    const name = keyToTitle(key);

    await TemplatePdf.findOrCreate({
      where: { company_id, builder_id, name },
      defaults: {
        company_id,
        builder_id,
        name,
        template_json: keysToSnakeCase(templateJson),
        created_by,
        updated_by: created_by,
      },
      transaction,
    });
  }
}

export default {
  seedInitialPdfTemplates,
};
