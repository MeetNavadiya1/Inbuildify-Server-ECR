import db from "../../config/database/models/postgre-models/index.js";
import { checkLeadLockStatus } from "../../helper/leadLock.helper.js";
import { syncCompactionReportCharge } from "../../helper/quotation.helper.js";
import { keysToCamelCase } from "../../utils/common.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";
import { upsertPropertyDriveFile, deletePropertyDriveFile, getPropertyDriveFile, getS3KeyFromUrl } from "../../helper/propertyDriveFile.helper.js";
import { DRIVE_FILE_MAPPING } from "../../constants/driveFile.js";
import { env } from "../../config/env.config.js";
import { logActivity, logUpdatedFieldNames } from "../../utils/activityLogger.js";

const getAbsoluteS3Url = (keyOrUrl) => {
  if (!keyOrUrl || typeof keyOrUrl !== "string") {
    return keyOrUrl;
  }
  if (keyOrUrl.startsWith("http")) {
    return keyOrUrl;
  }
  const s3Prefix = `https://${env.AWS.S3_BUCKET_NAME}.s3.${env.AWS.AWS_REGION}.amazonaws.com/`;
  return `${s3Prefix}${keyOrUrl}`;
};

export const createPropertyService = async (leadsId, propertyData, user, file = null) => {
  const { Leads, PropertyDetail, State, Country, EstateStages, PriceList, PriceListItem, DriveFile } = db;
  const transaction = await db.sequelize.transaction();

  try {
    const builderId = user?.builder_id;
    const companyId = user?.company_id;
    const userId = user?.user_id;

    if (!builderId && !companyId) {
      throw { status: 401, message: "Unauthorized: User must belong to either a builder or company" };
    }

    // 2. Lead existence and permission check
    const lead = await Leads.findOne({
      where: {
        leads_id: leadsId,
        [db.Sequelize.Op.or]: [
          { company_id: companyId || null },
          { builder_id: builderId || null },
        ],
      },
      transaction,
    });

    if (!lead) {
      throw { status: 400, message: "Invalid lead id." };
    }

    await checkLeadLockStatus(leadsId);

    // 3. Existing property check
    if (lead.property_detail_id) {
      throw { status: 400, message: "Property already exists for this lead. Only one property is allowed per lead." };
    }

    // 4. Compaction report validation
    if (propertyData.compaction_report === "available" && propertyData.compaction_report_provider) {
      throw { status: 400, message: "compactionReportProvider is not allowed when compactionReport is available." };
    }

    if (propertyData.compaction_report === "available") {
      propertyData.compaction_report_provider = null;
    }

    // 5. Create Property Detail.
    // compaction_report_url stores a DriveFile PK, not the raw S3 URL — start
    // it NULL and point it at the DriveFile created below (if any).
    const incomingReportUrl = propertyData.compaction_report_url;
    const newProperty = await PropertyDetail.create(
      {
        ...propertyData,
        compaction_report_url: null,
        land_type: propertyData.land_type || "REGULAR",
        is_hl_package_lot: false,
      },
      { transaction },
    );

    // Create the polymorphic DriveFile (if a report was uploaded / provided) and
    // store its file_id in compaction_report_url. Ignore browser-local blob URLs.
    const incomingIsBlob = typeof incomingReportUrl === "string" && incomingReportUrl.startsWith("blob:");
    if (file || (incomingReportUrl && !incomingIsBlob)) {
      let s3Key = null;
      let size = null;
      let originalName = null;
      let mimeType = "application/pdf";

      if (file) {
        s3Key = file.key;
        size = file.size;
        originalName = file.originalname;
        mimeType = file.mimetype;
      } else {
        s3Key = getS3KeyFromUrl(incomingReportUrl);
        originalName = s3Key ? s3Key.split("/").pop() : "compaction-report.pdf";
      }

      if (s3Key) {
        const driveFile = await upsertPropertyDriveFile({
          propertyDetailId: newProperty.property_detail_id,
          s3Key,
          size,
          originalName,
          mimeType,
          companyId,
          builderId,
          leadId: leadsId,
          uploadedBy: userId,
          transaction,
        });
        await newProperty.update({ compaction_report_url: driveFile.file_id }, { transaction });
      }
    }

    // 6. Link to Lead and update status
    const updateData = {
      property_detail_id: newProperty.property_detail_id,
    };

    if (lead.status === "New") {
      updateData.status = "Working";
    }

    await lead.update(updateData, { transaction });

    // 7. Create Base Price and Compaction Report Charge if compaction_report_provider is 'builder'
    if (propertyData.compaction_report_provider === "builder") {
      // Create or find "Base Price" PriceList
      const [priceList] = await PriceList.findOrCreate({
        where: {
          builder_id: builderId,
          name: "Base Price",
        },
        defaults: {
          company_id: companyId || null,
          builder_id: builderId,
          name: "Base Price",
          sort_order: 1,
          is_active: true,
          created_by: userId || null,
        },
        transaction,
      });

      // Create or find default PriceListItem for this PriceList
      await PriceListItem.findOrCreate({
        where: {
          price_list_id: priceList.price_list_id,
          item_description: "Compaction Report Charge",
        },
        defaults: {
          price_list_id: priceList.price_list_id,
          company_id: companyId || null,
          builder_id: builderId,
          item_description: "Compaction Report Charge",
          cost_type: "Fixed",
          cost: 250.00,
          builder_cost: 100.00,
          status: "active",
          created_by: userId || null,
          is_system_data: true,
        },
        transaction,
      });
    }

    await logActivity(transaction, {
      userId,
      builderId,
      companyId,
      referenceId: leadsId,
      referenceType: "LEAD",
      module: "Property",
      moduleId: newProperty.property_detail_id,
      recordName: "Property",
      action: "CREATE",
      description: "Property detail created",
    });

    await transaction.commit();

    // 8. Re-fetch enriched
    const enriched = await PropertyDetail.findOne({
      where: { property_detail_id: newProperty.property_detail_id },
      include: [
        { model: State, as: "state", attributes: ["name"] },
        { model: Country, as: "country", attributes: ["name"] },
        { model: EstateStages, as: "estateStage", attributes: ["name"] },
        { model: DriveFile, as: "compactionReportFile", attributes: ["s3_key"] },
      ],
    });

    // Flatten names and remove nested objects for exact backward compatibility
    const plain = enriched.get({ plain: true });
    const result = {
      ...plain,
      compaction_report_url: plain.compactionReportFile?.s3_key
        ? getAbsoluteS3Url(plain.compactionReportFile.s3_key)
        : (plain.compaction_report_url && typeof plain.compaction_report_url === "string" && plain.compaction_report_url.startsWith("http")
          ? plain.compaction_report_url
          : null),
      state_name: plain.state?.name || null,
      country_name: plain.country?.name || null,
      estate_stage_name: plain.estateStage?.name || null,
    };

    // Remove the nested objects to match the original flat SQL result
    delete result.state;
    delete result.country;
    delete result.estateStage;
    delete result.compactionReportFile;

    return result;

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Get property detail associated with a specific lead
 * @param {string} leadsId - The lead ID
 * @param {Object} user - Current user object
 * @returns {Promise<Object|null>} - Flattened property detail or null
 */
export const getPropertyByLeadIdService = async (leadsId, user) => {
  const { Leads, PropertyDetail, State, Country, EstateStages, Sequelize, DriveFile } = db;
  const builderId = user?.builder_id;
  const companyId = user?.company_id;

  if (!builderId && !companyId) {
    throw { status: 401, message: "Unauthorized: User must belong to either a builder or company" };
  }

  // 1. Fetch lead with property details and related metadata
  const lead = await Leads.findOne({
    where: {
      leads_id: leadsId,
      [Sequelize.Op.or]: [
        { company_id: companyId || null },
        { builder_id: builderId || null },
      ],
    },
    include: [
      {
        model: PropertyDetail,
        as: "propertyDetail",
        include: [
          { model: State, as: "state", attributes: ["name"] },
          { model: Country, as: "country", attributes: ["name"] },
          { model: EstateStages, as: "estateStage", attributes: ["name"] },
          { model: DriveFile, as: "compactionReportFile", attributes: ["s3_key"] },
        ],
      },
    ],
  });

  if (!lead || !lead.propertyDetail) {
    return null;
  }

  const plain = lead.propertyDetail.get({ plain: true });

  // 2. Flatten metadata names for backward compatibility
  const result = {
    ...plain,
    compaction_report_url: plain.compactionReportFile?.s3_key
      ? getAbsoluteS3Url(plain.compactionReportFile.s3_key)
      : (plain.compaction_report_url && typeof plain.compaction_report_url === "string" && plain.compaction_report_url.startsWith("http")
        ? plain.compaction_report_url
        : null),
    state_name: plain.state?.name || null,
    country_name: plain.country?.name || null,
    estate_stage_name: plain.estateStage?.name || null,
  };

  // 3. Remove nested objects to match raw SQL result structure
  delete result.state;
  delete result.country;
  delete result.estateStage;
  delete result.compactionReportFile;

  return keysToCamelCase(result);
};

export const updatePropertyService = async (propertyDetailId, propertyData, file, user) => {
  const { PropertyDetail, Leads, Estate, EstateStages, State, Country, PriceList, PriceListItem, Sequelize, DriveFile } = db;
  const transaction = await db.sequelize.transaction();

  try {
    const { builder_id: builderId, company_id: companyId, user_id: userId } = user;

    if (!builderId && !companyId) {
      throw { status: 401, message: "Unauthorized: User must belong to either a builder or company" };
    }

    // 1. Fetch existing property & Verify ownership through Leads
    const existingProperty = await PropertyDetail.findOne({
      where: { property_detail_id: propertyDetailId },
      include: [
        {
          model: Leads,
          as: "leads",
          where: {
            [Sequelize.Op.or]: [
              { company_id: companyId || null },
              { builder_id: builderId || null },
            ]
          },
          required: true
        }
      ],
      transaction,
    });

    if (!existingProperty) {
      throw { status: 404, message: "Property not found or does not belong to your organization." };
    }

    // Fetch old enriched data for comparison log
    const oldEnriched = await PropertyDetail.findOne({
      where: { property_detail_id: propertyDetailId },
      include: [
        { model: State, as: "state", attributes: ["name"] },
        { model: Country, as: "country", attributes: ["name"] },
        { model: EstateStages, as: "estateStage", attributes: ["name"] },
      ],
      transaction,
    });
    const oldPlain = oldEnriched ? oldEnriched.get({ plain: true }) : {};
    const oldDataForLog = oldEnriched ? {
      ...oldPlain,
      compaction_report_url: getAbsoluteS3Url(oldPlain.compaction_report_url),
      state_name: oldPlain.state?.name || null,
      country_name: oldPlain.country?.name || null,
      estate_stage_name: oldPlain.estateStage?.name || null,
    } : {};
    if (oldDataForLog.state) delete oldDataForLog.state;
    if (oldDataForLog.country) delete oldDataForLog.country;
    if (oldDataForLog.estateStage) delete oldDataForLog.estateStage;

    const { compaction_report, compaction_report_content, compaction_report_url } = propertyData;

    // Whether the compaction report should be cleared (URL explicitly nulled).
    // The DriveFile row + its S3 object are removed in the sync block below.
    const clearReport = compaction_report_url === null;

    // Business Logic: If status is not_available, clear stored content too.
    if (compaction_report === "not_available") {
      propertyData.compaction_report_content = null;
    }

    if (compaction_report === "available" && propertyData.compaction_report_provider) {
      throw { status: 400, message: "compactionReportProvider is not allowed when compactionReport is available." };
    }

    if (compaction_report === "available") {
      propertyData.compaction_report_provider = null;
    }

    const resolvedCompactionReport = compaction_report || existingProperty.compaction_report;
    if (propertyData.compaction_report_provider && resolvedCompactionReport === "available" && compaction_report !== "available") {
      throw { status: 400, message: "compactionReportProvider is not allowed when compactionReport is available." };
    }

    // Mandatory content when switching to available
    const isSwitchingToAvailable = compaction_report === "available" && existingProperty.compaction_report === "not_available";
    const hasNewContent = compaction_report_content !== undefined || compaction_report_url !== undefined || file !== undefined;

    if (isSwitchingToAvailable && !hasNewContent) {
      throw { status: 400, message: "Compaction report content or file is required when switching status to available." };
    }

    const estateId = propertyData.estate_id;
    if (estateId) {
      const estateCheck = await Estate.findOne({
        where: {
          estate_id: estateId,
          status: true,
          [Sequelize.Op.or]: [
            { company_id: companyId || null },
            { builder_id: builderId || null },
          ]
        },
        transaction
      });
      if (!estateCheck) {
        throw { status: 400, message: "Invalid estate id." };
      }
    }

    const estateStageId = propertyData.estate_stage_id;
    if (estateStageId) {
      const resolvedEstateId = estateId || existingProperty.estate_id;
      if (!resolvedEstateId) {
        throw { status: 400, message: "Estate must be selected before setting estate stage." };
      }
      const stageCheck = await EstateStages.findOne({
        where: {
          estate_stage_id: estateStageId,
          estate_id: resolvedEstateId
        },
        transaction
      });
      if (!stageCheck) {
        throw { status: 400, message: "Invalid estate stage id or it does not belong to the selected estate." };
      }
    }

    const updatePayload = {};
    const allowedFields = [
      "lot_number", "street", "address_line1", "address_line2", "city",
      "state_id", "country_id", "zip_code", "estate_id", "estate_stage_id",
      "estate_name", "title_status", "title_date", "compaction_report",
      "compaction_report_content", "land_type",
      "width_m", "depth_m", "total_size_m2", "site_fall_mm", "land_fill_mm",
      "bush_fire", "corner_block", "price", "clearing_date", "compaction_report_provider"
    ];

    for (const field of allowedFields) {
      if (propertyData[field] !== undefined) {
        updatePayload[field] = propertyData[field] === null ? null : propertyData[field];
      }
    }

    // The compaction report itself is not a plain column write — it is tracked
    // by the DriveFile sync below. Treat a new file, a (re)submitted URL, or a
    // clear request as a meaningful change so the "nothing to update" guard
    // doesn't reject report-only updates.
    const hasReportChange =
      file !== undefined && file !== null
        ? true
        : clearReport || (compaction_report_url !== undefined && compaction_report_url !== null);

    if (Object.keys(updatePayload).length === 0 && !hasReportChange) {
      throw { status: 400, message: "No valid fields to update" };
    }

    await existingProperty.update(updatePayload, { transaction });

    // --- Compaction report ⇄ DriveFile sync (column stores the DriveFile PK) ---
    // Read the current DriveFile first so its old S3 object can be cleaned up
    // when the file is replaced or removed.
    const existingFile = await getPropertyDriveFile(
      existingProperty.property_detail_id,
      DRIVE_FILE_MAPPING.SUB_REFERENCES.COMPACTION_REPORT,
      { transaction },
    );
    const oldS3Key = existingFile?.s3_key || null;

    const isBlobUrl = typeof compaction_report_url === "string" && compaction_report_url.startsWith("blob:");
    if (isBlobUrl) {
      console.warn(`[PropertyService] Ignoring browser-local blob URL for compaction_report_url: ${compaction_report_url}`);
    }

    if (clearReport) {
      await deletePropertyDriveFile(
        existingProperty.property_detail_id,
        DRIVE_FILE_MAPPING.SUB_REFERENCES.COMPACTION_REPORT,
        { transaction },
      );
      if (oldS3Key) await deleteFromS3(oldS3Key);
      await existingProperty.update({ compaction_report_url: null }, { transaction });
    } else if (file || (typeof compaction_report_url === "string" && !isBlobUrl)) {
      let s3Key = null;
      let size = null;
      let originalName = null;
      let mimeType = "application/pdf";

      if (file) {
        s3Key = file.key;
        size = file.size;
        originalName = file.originalname;
        mimeType = file.mimetype;
      } else {
        s3Key = getS3KeyFromUrl(compaction_report_url);
        originalName = s3Key ? s3Key.split("/").pop() : "compaction-report.pdf";
      }

      if (s3Key) {
        const firstLead = existingProperty.leads?.[0];
        const leadId = firstLead ? firstLead.leads_id : null;

        const driveFile = await upsertPropertyDriveFile({
          propertyDetailId: existingProperty.property_detail_id,
          s3Key,
          size,
          originalName,
          mimeType,
          companyId,
          builderId,
          leadId,
          uploadedBy: userId,
          transaction,
        });
        await existingProperty.update({ compaction_report_url: driveFile.file_id }, { transaction });
        if (oldS3Key && oldS3Key !== s3Key) await deleteFromS3(oldS3Key);
      }
    }

    // Business Logic: Create Base Price and Compaction Report Charge if compaction_report_provider is 'builder'
    const currentProvider = propertyData.compaction_report_provider || existingProperty.compaction_report_provider;
    if (currentProvider === "builder") {
      const [priceList] = await PriceList.findOrCreate({
        where: { builder_id: builderId, name: "Base Price" },
        defaults: {
          company_id: companyId || null,
          builder_id: builderId,
          name: "Base Price",
          sort_order: 1,
          is_active: true,
          created_by: userId || null,
        },
        transaction
      });

      await PriceListItem.findOrCreate({
        where: { price_list_id: priceList.price_list_id, item_description: "Compaction Report Charge" },
        defaults: {
          price_list_id: priceList.price_list_id,
          company_id: companyId || null,
          builder_id: builderId,
          item_description: "Compaction Report Charge",
          cost_type: "Fixed",
          cost: 250.00,
          builder_cost: 100.00,
          status: "active",
          created_by: userId || null,
          is_system_data: true,
        },
        transaction
      });
    }

    // Push the compaction report decision into the quotations that price it.
    //
    // The block above only guarantees the *catalogue* entry exists; it never
    // touched a quotation, so flipping the report to "not_available / builder"
    // left every open quotation without the charge and its Grand Total short by
    // the charge, and flipping back to "available" (or to "self") left the
    // charge stranded on the quotation — with no way to remove it, since the
    // line is system data and the UI refuses to delete those by hand. The sync
    // below is the only thing that owns that line: it adds, removes and leaves
    // approved/sample versions alone, so the quotation follows the property in
    // both directions.
    //
    // Runs inside this transaction: if the sync fails the property edit rolls
    // back with it rather than committing a property the quotations disagree
    // with.
    for (const lead of existingProperty.leads || []) {
      await syncCompactionReportCharge(lead.leads_id, builderId, companyId, userId, transaction);
    }

    // Re-fetch with state/country/estate names for exact backwards compatibility of JSON response
    const enriched = await PropertyDetail.findOne({
      where: { property_detail_id: propertyDetailId },
      include: [
        { model: State, as: "state", attributes: ["name"] },
        { model: Country, as: "country", attributes: ["name"] },
        { model: EstateStages, as: "estateStage", attributes: ["name"] },
        { model: DriveFile, as: "compactionReportFile", attributes: ["s3_key"] },
      ],
      transaction,
    });

    const plain = enriched.get({ plain: true });

    const result = {
      ...plain,
      compaction_report_url: plain.compactionReportFile?.s3_key
        ? getAbsoluteS3Url(plain.compactionReportFile.s3_key)
        : (plain.compaction_report_url && typeof plain.compaction_report_url === "string" && plain.compaction_report_url.startsWith("http")
          ? plain.compaction_report_url
          : null),
      state_name: plain.state?.name || null,
      country_name: plain.country?.name || null,
      estate_stage_name: plain.estateStage?.name || null,
    };

    delete result.state;
    delete result.country;
    delete result.estateStage;
    delete result.compactionReportFile;

    // Log Activity for each associated lead — record only the names of the
    // changed fields, not their old/new values.
    //
    // compaction_report_url must NOT be compared as a rendered URL. The same
    // file is surfaced as different strings depending on the code path: the
    // model's afterFind hook builds `bucket.s3.amazonaws.com/<key>` (no region,
    // and `null` if its DriveFile lookup misses) while the response builder
    // above uses `bucket.s3.<region>.amazonaws.com/<key>` (with region). Those
    // never match for an unchanged report, so every property edit falsely logged
    // the compaction report as "updated".
    //
    // Compare the authoritative S3 keys instead: `oldS3Key` was read straight
    // from the DriveFile row before the sync, and the post-sync key is derived
    // from the same polymorphic file. Equal keys ⇒ the report did not change.
    const oldDataForCompare = keysToCamelCase(oldDataForLog);
    const newDataForCompare = keysToCamelCase(result);
    oldDataForCompare.compactionReportUrl = oldS3Key;
    newDataForCompare.compactionReportUrl = getS3KeyFromUrl(result.compaction_report_url);

    const associatedLeads = existingProperty.leads || [];
    for (const lead of associatedLeads) {
      await logUpdatedFieldNames(transaction, {
        userId,
        builderId,
        companyId,
        referenceId: lead.leads_id,
        referenceType: "LEAD",
        module: "Property",
        moduleId: propertyDetailId,
        recordName: "Property",
        oldData: oldDataForCompare,
        newData: newDataForCompare,
      });
    }

    await transaction.commit();

    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Deletes a property after unlinking it from associated leads.
 */
export async function deletePropertyService(propertyDetailId, user) {
  const { PropertyDetail, Leads, sequelize } = db;
  const builderId = user?.builder_id;
  const companyId = user?.company_id;
  const userId = user?.user_id;

  if (!builderId && !companyId) {
    return {
      error: {
        status: 401,
        message:
          "Unauthorized: User must belong to either a builder or company",
      },
    };
  }

  const transaction = await sequelize.transaction();

  try {
    // 1. Ownership check by joining with Leads
    const existing = await PropertyDetail.findOne({
      where: { property_detail_id: propertyDetailId },
      include: [
        {
          model: Leads,
          as: "leads",
          where: {
            [db.Sequelize.Op.or]: [
              companyId ? { company_id: companyId } : null,
              builderId ? { builder_id: builderId } : null,
            ].filter(Boolean),
          },
          required: true,
        },
      ],
      transaction,
    });

    if (!existing) {
      await transaction.rollback();
      return {
        error: {
          status: 404,
          message:
            "Property not found or does not belong to your organization.",
        },
      };
    }

    // Log activity for each associated lead
    const associatedLeads = existing.leads || [];
    for (const lead of associatedLeads) {
      await logActivity(transaction, {
        userId,
        builderId,
        companyId,
        referenceId: lead.leads_id,
        referenceType: "LEAD",
        module: "Property",
        moduleId: propertyDetailId,
        recordName: "Property",
        action: "DELETE",
        description: "Property detail deleted",
      });
    }

    // 2. Unlink from leads
    await Leads.update(
      { property_detail_id: null },
      {
        where: { property_detail_id: propertyDetailId },
        transaction,
      },
    );

    // 3. Delete property
    await deletePropertyDriveFile(propertyDetailId, DRIVE_FILE_MAPPING.SUB_REFERENCES.COMPACTION_REPORT, { transaction });

    await PropertyDetail.destroy({
      where: { property_detail_id: propertyDetailId },
      transaction,
    });

    await transaction.commit();
    return { success: true };
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}