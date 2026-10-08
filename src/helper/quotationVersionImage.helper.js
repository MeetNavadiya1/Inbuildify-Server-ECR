import { Op } from "sequelize";
import { DRIVE_FILE_MAPPING } from "../constants/driveFile.js";
import { buildDriveFileName, ensureUniqueDriveFileName } from "../service/fileNaming.service.js";

/**
 * DriveFile synchronisation for a QuotationVersion's Facade / Floor Plan
 * images. When a version is created (or its facade/floor plan changes) the
 * source images are *cloned* into the polymorphic drive_files table so the
 * version owns its own copies (reference_type=QuotationVersion).
 *
 * This lived inline in two QuotationVersion model hooks. It was moved here to
 * keep the model declarative and to collapse the per-image query fan-out:
 *   - source DriveFiles are fetched in ONE `findAll` (was up to 3 `findByPk`),
 *   - clones are written in ONE `bulkCreate` (was up to 3 `create`).
 */

const { REFERENCE_NAMES, SUB_REFERENCES } = DRIVE_FILE_MAPPING;
const VERSION_REFERENCE = REFERENCE_NAMES.QUOTATION_VERSION;

const FLOOR_PLAN_SUB_TYPES = [
  SUB_REFERENCES.FLOOR_PLAN_SIMPLE,
  SUB_REFERENCES.FLOOR_PLAN_DETAILED,
];

/**
 * Resolve the source DriveFile ids that should be cloned for a version, along
 * with the sub-reference metadata each clone needs.
 *
 * @returns {Promise<Array<{ sourceFileId, subReferenceId, subReferenceType }>>}
 */
async function resolveImageSources(instance, sequelize, transaction, { includeFacade, includeFloorPlan }) {
  const { Facade, FloorPlan } = sequelize.models;
  const specs = [];

  if (includeFacade && instance.facade_id) {
    const facade = await Facade.findByPk(instance.facade_id, {
      attributes: ["image"],
      transaction,
      hooks: false,
    });
    if (facade?.image) {
      specs.push({
        sourceFileId: facade.image,
        subReferenceId: instance.facade_id,
        subReferenceType: SUB_REFERENCES.FACADE_IMAGE,
      });
    }
  }

  if (includeFloorPlan && instance.floor_plan_id) {
    const floorPlan = await FloorPlan.findByPk(instance.floor_plan_id, {
      attributes: ["detailed_image", "simple_image"],
      transaction,
      hooks: false,
    });
    if (floorPlan?.detailed_image) {
      specs.push({
        sourceFileId: floorPlan.detailed_image,
        subReferenceId: instance.floor_plan_id,
        subReferenceType: SUB_REFERENCES.FLOOR_PLAN_DETAILED,
      });
    }
    if (floorPlan?.simple_image) {
      specs.push({
        sourceFileId: floorPlan.simple_image,
        subReferenceId: instance.floor_plan_id,
        subReferenceType: SUB_REFERENCES.FLOOR_PLAN_SIMPLE,
      });
    }
  }

  return specs;
}

/**
 * Clone the resolved source DriveFiles onto the version. One `findAll` to load
 * every source row, one `bulkCreate` to write the clones.
 */
async function cloneImages(instance, specs, leadId, sequelize, transaction) {
  if (!specs.length) return;

  const { DriveFile } = sequelize.models;
  const versionId = instance.quotation_version_id;

  const sources = await DriveFile.findAll({
    where: { file_id: { [Op.in]: specs.map((s) => s.sourceFileId) } },
    transaction,
    hooks: false,
  });
  const sourceById = new Map(sources.map((row) => [row.file_id, row.get({ plain: true })]));

  const payloads = [];
  const usedNamesInBatch = new Set();
  for (const spec of specs) {
    const source = sourceById.get(spec.sourceFileId);
    if (!source) continue;

    const clone = { ...source };
    delete clone.file_id;
    delete clone.created_at;
    delete clone.updated_at;
    delete clone.deleted_at;

    clone.reference_id = versionId;
    clone.reference_type = VERSION_REFERENCE;
    clone.sub_reference_id = spec.subReferenceId;
    clone.sub_reference_type = spec.subReferenceType;
    clone.lead_id = leadId;
    // The copy belongs to the version, not to the catalog row it was taken
    // from, so it takes the version's flag rather than the source file's.
    // Spreading `source` carried is_sample_data across: a real quotation that
    // picked a seeded facade or floor plan got its images marked as sample
    // data, and Settings → Sample Data then deleted them — rows and S3 objects
    // — while the version they belonged to stayed. The import still tags its
    // own clones, because the version it is copying onto is itself flagged.
    clone.is_sample_data = instance.is_sample_data === true;
    // Name the clone from the administrator-configured format like any other
    // file, then de-duplicate — `file_name` is UNIQUE and the format can well
    // render the same name for two clones of one version.
    const uniqueFileName = await ensureUniqueDriveFileName(
      await buildDriveFileName({
        subReferenceType: spec.subReferenceType,
        companyId: source.company_id,
        builderId: source.builder_id,
        leadId,
        quotationVersionId: versionId,
        originalName: source.original_name,
        extension: source.file_extension,
        mimeType: source.mime_type,
        transaction,
      }),
      { transaction, existingNames: usedNamesInBatch, companyId: source.company_id },
    );
    usedNamesInBatch.add(uniqueFileName);
    clone.file_name = uniqueFileName;

    payloads.push(clone);
  }

  if (payloads.length) {
    await DriveFile.bulkCreate(payloads, { transaction });
  }
}

async function getLeadId(instance, sequelize, transaction) {
  const { Quotation } = sequelize.models;
  const quotation = await Quotation.findByPk(instance.quotation_id, {
    attributes: ["leads_id"],
    transaction,
    hooks: false,
  });
  return quotation?.leads_id ?? null;
}

/**
 * afterCreate hook body: clone the version's facade + floor plan images.
 */
export async function cloneQuotationVersionImages(instance, sequelize, transaction) {
  const specs = await resolveImageSources(instance, sequelize, transaction, {
    includeFacade: true,
    includeFloorPlan: true,
  });
  if (!specs.length) return;

  const leadId = await getLeadId(instance, sequelize, transaction);
  if (!leadId) return;

  await cloneImages(instance, specs, leadId, sequelize, transaction);
}

/**
 * afterUpdate hook body: when facade_id / floor_plan_id change, drop the stale
 * cloned images and re-clone from the new source. Only the changed image type
 * is touched.
 */
export async function syncQuotationVersionImages(instance, sequelize, transaction) {
  const facadeChanged = instance.changed("facade_id");
  const floorPlanChanged = instance.changed("floor_plan_id");
  if (!facadeChanged && !floorPlanChanged) return;

  // Gate on leadId before touching anything — matches the original hook, which
  // left stale clones untouched when the quotation had no lead.
  const leadId = await getLeadId(instance, sequelize, transaction);
  if (!leadId) return;

  const { DriveFile } = sequelize.models;
  const versionId = instance.quotation_version_id;

  if (facadeChanged) {
    await DriveFile.destroy({
      where: { reference_id: versionId, sub_reference_type: SUB_REFERENCES.FACADE_IMAGE },
      transaction,
    });
  }
  if (floorPlanChanged) {
    await DriveFile.destroy({
      where: { reference_id: versionId, sub_reference_type: { [Op.in]: FLOOR_PLAN_SUB_TYPES } },
      transaction,
    });
  }

  const specs = await resolveImageSources(instance, sequelize, transaction, {
    includeFacade: facadeChanged,
    includeFloorPlan: floorPlanChanged,
  });
  if (!specs.length) return;

  await cloneImages(instance, specs, leadId, sequelize, transaction);
}
