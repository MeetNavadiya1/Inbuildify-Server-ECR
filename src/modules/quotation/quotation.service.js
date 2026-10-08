import quotationRepository from "./quotation.repository.js";
import leadsService from "../lead/leads.service.js";
import { generateDynamicReferenceNumber, keysToCamelCase } from "../../utils/common.js";
import {
  getQuotationDriveFileS3Key,
  getQuotationDriveFilePresignedUrl,
  getQuotationDriveFile,
  upsertQuotationDriveFile,
} from "../../helper/quotationDriveFile.helper.js";
import { generateEngineerPdfHtml } from "../../utils/engineerPdfTemplate.js";
import { resolveCompactionS3Key } from "../../helper/propertyDriveFile.helper.js";
import { DRIVE_FILE_MAPPING } from "../../constants/driveFile.js";
import { logActivity, compareAndLogUpdates } from "../../utils/activityLogger.js";
import db from "../../config/database/models/postgre-models/index.js";
import {
  DRIVE_FILE_REFERENCE_TYPE,
  DRIVE_FILE_SUB_REFERENCE_TYPE,
} from "../../config/database/models/postgre-models/drive-file.constants.js";
import { Op } from "sequelize";
import { generatePDF } from "./pdf.service.js";
import { generateQuotationHTML } from "../../utils/template.js";
import { inlineQuotationPdfImages, toDataUri } from "../../utils/quotationPdfImages.js";
import { uploadFile, generatePresignedDownloadUrl } from "../../service/s3.service.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";
import { checkLeadLockStatus } from "../../helper/leadLock.helper.js";
import { checkQuotationLockStatus, syncCompactionReportCharge } from "../../helper/quotation.helper.js";
import docusignService from "../../service/docusign.service.js";
import { encodeQuotationHash, decodeQuotationHash } from "../../utils/hashEncoder.js";
import emailQueue from "../../queues/emailQueue.js";
import pdfQueue from "../../queues/pdfQueue.js";

const syncQuotationVersionFiles = async (quotationVersion, leadsId, transaction) => {
  const { DriveFile } = db;
  const qvId = quotationVersion.quotation_version_id;

  // Handle Facade changes
  if (quotationVersion.facade_id) {
    // Delete old facade drive files for this QV
    await DriveFile.destroy({
      where: {
        reference_id: qvId,
        sub_reference_type: DRIVE_FILE_SUB_REFERENCE_TYPE.FACADE_IMAGE,
      },
      transaction,
    });

    const facadeFiles = await DriveFile.findAll({
      where: {
        reference_id: quotationVersion.facade_id,
        reference_type: DRIVE_FILE_REFERENCE_TYPE.FACADE,
        sub_reference_type: DRIVE_FILE_SUB_REFERENCE_TYPE.FACADE_IMAGE,
      },
      transaction,
    });

    for (const file of facadeFiles) {
      const fileData = file.get({ plain: true });
      delete fileData.file_id;
      delete fileData.created_at;
      delete fileData.updated_at;
      delete fileData.deleted_at;

      fileData.reference_id = qvId;
      fileData.reference_type = DRIVE_FILE_REFERENCE_TYPE.QUOTATION;
      fileData.sub_reference_id = quotationVersion.facade_id;
      fileData.sub_reference_type = DRIVE_FILE_SUB_REFERENCE_TYPE.FACADE_IMAGE;
      fileData.file_name = `qv_${qvId}_${Date.now()}_${fileData.original_name}`;
      fileData.lead_id = leadsId;

      await DriveFile.create(fileData, { transaction });
    }
  }

  // Handle Floor Plan changes
  if (quotationVersion.floor_plan_id) {
    // Delete old floor plan drive files for this QV
    await DriveFile.destroy({
      where: {
        reference_id: qvId,
        sub_reference_type: {
          [Op.in]: [DRIVE_FILE_SUB_REFERENCE_TYPE.FLOOR_PLAN_SIMPLE_IMAGE, DRIVE_FILE_SUB_REFERENCE_TYPE.FLOOR_PLAN_DETAILED_IMAGE],
        },
      },
      transaction,
    });

    const floorPlanFiles = await DriveFile.findAll({
      where: {
        reference_id: quotationVersion.floor_plan_id,
        reference_type: DRIVE_FILE_REFERENCE_TYPE.FLOOR_PLAN,
        sub_reference_type: {
          [Op.in]: [DRIVE_FILE_SUB_REFERENCE_TYPE.FLOOR_PLAN_SIMPLE_IMAGE, DRIVE_FILE_SUB_REFERENCE_TYPE.FLOOR_PLAN_DETAILED_IMAGE],
        },
      },
      transaction,
    });

    for (const file of floorPlanFiles) {
      const fileData = file.get({ plain: true });
      delete fileData.file_id;
      delete fileData.created_at;
      delete fileData.updated_at;
      delete fileData.deleted_at;

      fileData.reference_id = qvId;
      fileData.reference_type = DRIVE_FILE_REFERENCE_TYPE.QUOTATION;
      fileData.sub_reference_id = quotationVersion.floor_plan_id;
      fileData.file_name = `qv_${qvId}_${Date.now()}_${fileData.original_name}`;
      fileData.lead_id = leadsId;

      await DriveFile.create(fileData, { transaction });
    }
  }
};
// NOTE: cloning a version's facade / floor-plan images into drive_files is
// handled centrally by the QuotationVersion afterCreate / afterUpdate hooks
// (see helper/quotationVersionImage.helper.js). The service no longer clones
// them inline — doing so issued redundant destroy/find/create queries on every
// version create + update (and used mismatched reference_type casing, so it
// never actually matched a source row).

class QuotationService {
  async createQuotation(leadsId, userId, builderId, companyId) {
    const t = await db.sequelize.transaction();
    try {
      console.log(`[DEBUG] Starting createQuotation for lead: ${leadsId}`);
      const {
        Leads, Quotation, QuotationVersion, QuotationVersionItem,
        QuotationVersionCustomSection, PropertyDetail, sequelize
      } = db;

      // 1. Check if lead exists and access scope
      const lead = await Leads.findOne({
        where: {
          leads_id: leadsId,
          [Op.or]: [{ builder_id: builderId }, { company_id: companyId }]
        },
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (!lead) {
        await t.rollback();
        return { success: false, message: "Lead not found or unauthorized" };
      }

      await checkLeadLockStatus(leadsId, t);

      if (!lead.property_detail_id) {
        const { PropertyDetail } = db;
        const newProperty = await PropertyDetail.create(
          {
            land_type: "REGULAR",
            is_hl_package_lot: false,
          },
          { transaction: t }
        );
        await lead.update({ property_detail_id: newProperty.property_detail_id }, { transaction: t });
        lead.property_detail_id = newProperty.property_detail_id;
      }

      const reference_number = await generateDynamicReferenceNumber({
        prefix: "QT",
        tableName: "quotation",
        column: "reference_number",
        user: null,
        transaction: t,
      });
      console.log(`[DEBUG] Generated Reference Number: ${reference_number}`);

      // 3. Find latest version to copy from
      const latestVersion = await QuotationVersion.findOne({
        include: [{
          model: Quotation,
          as: "quotation",
          where: { leads_id: leadsId },
          required: true
        }],
        order: [
          [{ model: Quotation, as: "quotation" }, "created_at", "DESC"],
          ["quotation_version_no", "DESC"]
        ],
        transaction: t
      });

      // 4. Create new Quotation
      const quotation = await Quotation.create({
        leads_id: leadsId,
        reference_number,
        created_by: userId,
      }, { transaction: t });

      // 5. Create new Quotation Version
      const quotationVersion = await QuotationVersion.create({
        quotation_id: quotation.quotation_id,
        quotation_version_no: 1,
        location_id: latestVersion?.location_id || null,
        range_id: latestVersion?.range_id || null,
        dwelling_type_id: latestVersion?.dwelling_type_id || null,
        floor_plan_id: latestVersion?.floor_plan_id || null,
        facade_id: latestVersion?.facade_id || null,
        is_approve: false,
        package_id: latestVersion?.package_id || null,
        structure_engineer_id: latestVersion?.structure_engineer_id || null,
        structure_engineer_price: latestVersion?.structure_engineer_price || null,
        facade_price: latestVersion?.facade_price || 0,
      }, { transaction: t });
      console.log(`[DEBUG] Created Quotation Version ID: ${quotationVersion.quotation_version_id}`);

      // Facade / floor-plan images are cloned by the QuotationVersion afterCreate hook.

      // 6. Copy items and sections if latest version exists
      if (latestVersion) {
        const oldItems = await QuotationVersionItem.findAll({
          where: { quotation_version_id: latestVersion.quotation_version_id },
          transaction: t
        });

        if (oldItems.length > 0) {
          await QuotationVersionItem.bulkCreate(
            oldItems.map(item => {
              const itemJson = item.get({ plain: true });
              delete itemJson.quotation_version_item_id;
              delete itemJson.created_at;
              delete itemJson.updated_at;
              return {
                ...itemJson,
                quotation_version_id: quotationVersion.quotation_version_id,
              };
            }),
            { transaction: t }
          );
        }

        const oldSections = await QuotationVersionCustomSection.findAll({
          where: { quotation_version_id: latestVersion.quotation_version_id },
          transaction: t
        });

        if (oldSections.length > 0) {
          await QuotationVersionCustomSection.bulkCreate(
            oldSections.map(section => ({
              quotation_version_id: quotationVersion.quotation_version_id,
              file_url: section.file_url,
              sort_order: section.sort_order
            })),
            { transaction: t }
          );
        }
      }

      // 7. Sync compaction report charge
      await syncCompactionReportCharge(leadsId, builderId, companyId, userId, t);

      // 8. Convert lead to opportunity
      const convertStatus = latestVersion ? "Negotiation" : "Proposal";
      await leadsService.convertLeadToOpportunity(leadsId, null, builderId, companyId, convertStatus, t);

      // 9. Activity Logging
      await logActivity(t, {
        userId,
        builderId,
        companyId,
        referenceId: leadsId,
        referenceType: "LEAD",
        module: "Quotation",
        moduleId: quotation.quotation_id,
        recordName: reference_number,
        action: "CREATE",
        description: `Quotation created: ${reference_number}`,
      });

      console.log(`[DEBUG] Committing transaction...`);
      await t.commit();
      console.log(`[DEBUG] Transaction committed successfully.`);

      // Trigger PDF generation in background
      pdfQueue.add("pdfGeneration", {
        quotation_version_id: quotationVersion.quotation_version_id,
        builder_id: builderId,
        company_id: companyId
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true
      }).catch(err => console.error("Error adding PDF generation job:", err));

      // Enriched return data
      const enrichedVersion = await quotationRepository.getQuotationVersionDetailsById(quotationVersion.quotation_version_id);
      const formattedQuotation = keysToCamelCase(quotation.get({ plain: true }));
      formattedQuotation.versions = enrichedVersion ? [enrichedVersion] : [keysToCamelCase(quotationVersion.get({ plain: true }))];

      return {
        success: true,
        data: formattedQuotation,
        message: 201,
      };

    } catch (error) {
      if (t) await t.rollback();
      console.error("DEBUG: Error in createQuotation service:", error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async getQuotationsByLeadId(leadsId, builderId, companyId) {
    try {
      const leadResult = await leadsService.getLeadById(leadsId, builderId, companyId);
      if (!leadResult.success) {
        return {
          success: false,
          message: "Lead not found or unauthorized",
        };
      }

      const quotations = await quotationRepository.getAllQuotationsByLeadId(leadsId);

      return {
        success: true,
        data: quotations,
        message: "Quotations fetched successfully",
      };
    } catch (error) {
      console.error("DEBUG: Error in getQuotationsByLeadId service:", error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async getQuotationById(id, builderId, companyId, user = null) {
    try {
      if (!builderId) {
        return { success: false, message: "Builder ID is required" };
      }

      // 1. Try to find as Quotation ID
      const quotation = await quotationRepository.getQuotationById(id);

      if (quotation) {
        // Check ownership via the lead associated with the quotation. Passing
        // `user` lets the lead's Phase-4 row scope reject quotations whose lead
        // isn't owned by a Sales Executive / Agent.
        const leadResult = await leadsService.getLeadById(quotation.leadsId, builderId, companyId, user);
        if (!leadResult.success) {
          return {
            success: false,
            message: "Unauthorized: You do not have access to this quotation",
          };
        }

        return {
          success: true,
          data: quotation,
          message: "Quotation fetched successfully",
        };
      }

      // 2. Fallback: Check if it's a Lead ID
      const leadResult = await leadsService.getLeadById(id, builderId, companyId, user);
      if (leadResult.success) {
        const quotations = await quotationRepository.getAllQuotationsByLeadId(id);
        return {
          success: true,
          data: quotations,
          message: "Quotations for lead fetched successfully",
        };
      }

      return { success: false, message: "Quotation or Lead not found" };
    } catch (error) {
      console.error("DEBUG: Error in getQuotationById service:", error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async getAllQuotations(builderId, companyId, options = {}, user = null) {
    try {
      if (!builderId) {
        return { success: false, message: "Builder ID is required" };
      }
      const result = await quotationRepository.getAllQuotations(builderId, companyId, { ...options, user });
      return { success: true, data: result, message: "Quotations fetched successfully" };
    } catch (error) {
      console.error("Error in getAllQuotations service:", error);
      return { success: false, message: error.message };
    }
  }

  async getQuotationCountsByStatus(builderId, companyId) {
    try {
      if (!builderId) {
        return { success: false, message: "Builder ID is required" };
      }
      const counts = await quotationRepository.getQuotationCountsByStatus(builderId, companyId);
      return { success: true, data: counts, message: "Quotation counts fetched successfully" };
    } catch (error) {
      console.error("Error in getQuotationCountsByStatus service:", error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Quotation history for a single master-data entity (price list item, floor
   * plan, facade, package, color item, …) — powers the "Quotation History"
   * drawer on the settings master pages.
   */
  async getQuotationUsageHistory(builderId, companyId, entityType, entityId, options = {}) {
    try {
      if (!builderId) {
        return { success: false, message: "Builder ID is required" };
      }
      const result = await quotationRepository.getQuotationUsageHistory(
        builderId,
        companyId,
        entityType,
        entityId,
        options,
      );
      return { success: true, data: result, message: "Quotation history fetched successfully" };
    } catch (error) {
      if (error.status) throw error;
      console.error("Error in getQuotationUsageHistory service:", error);
      return { success: false, message: error.message };
    }
  }

  async getQuotationFilterOptions(builderId, companyId) {
    try {
      if (!builderId) {
        return { success: false, message: "Builder ID is required" };
      }
      const options = await quotationRepository.getQuotationFilterOptions(builderId, companyId);
      return { success: true, data: options, message: "Quotation filter options fetched successfully" };
    } catch (error) {
      console.error("Error in getQuotationFilterOptions service:", error);
      return { success: false, message: error.message };
    }
  }

  async getQuotationVersions(quotationId, builderId, companyId, versionId = null) {
    try {
      const { Quotation, Leads } = db.sequelize.models;
      const quotation = await Quotation.findOne({
        where: { quotation_id: quotationId },
        include: [{
          model: Leads,
          as: "lead",
          where: {
            [Op.or]: [
              { builder_id: builderId },
              ...(companyId ? [{ company_id: companyId }] : [])
            ]
          }
        }]
      });

      if (!quotation) {
        return { success: false, message: "Quotation not found or unauthorized" };
      }

      const versions = await quotationRepository.getVersionsByQuotationId(quotationId, versionId);

      return {
        success: true,
        data: versions,
        message: "Quotation versions fetched successfully",
      };
    } catch (error) {
      console.error("DEBUG: Error in getQuotationVersions service:", error);
      return { success: false, message: error.message };
    }
  }

  async getQuotationVersionById(versionId, builderId, companyId) {
    try {
      const { QuotationVersion, Quotation, Leads } = db.sequelize?.models || db;
      const checkResult = await QuotationVersion.findOne({
        where: { quotation_version_id: versionId },
        include: [{
          model: Quotation,
          as: "quotation",
          include: [{
            model: Leads,
            as: "lead",
            where: {
              [Op.or]: [
                { builder_id: builderId },
                ...(companyId ? [{ company_id: companyId }] : []),
              ],
            },
          }],
        }],
      });

      if (!checkResult) {
        return {
          success: false,
          message: "Quotation version not found or unauthorized",
        };
      }

      const version = await quotationRepository.getQuotationVersionDetailsById(versionId);

      return {
        success: true,
        data: version ? [version] : [],
        message: "Quotation version fetched successfully",
      };
    } catch (error) {
      console.error("DEBUG: Error in getQuotationVersionById service:", error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async updateQuotationVersion(versionId, updateData, builderId, companyId, userId) {
    const t = await db.sequelize.transaction();
    try {
      const {
        QuotationVersion, Quotation, Leads, StructureEngineer,
        QuotationVersionItem, QuotationVersionPricelistItemMap,
        Location, Range, DwellingType, FloorPlan, Facade, Package,
        PropertyDetail,
      } = db.sequelize?.models || db;

      // 1. Fetch version and verify ownership via quotation -> lead
      const existingVersion = await QuotationVersion.findOne({
        where: { quotation_version_id: versionId },
        include: [
          {
            model: Quotation,
            as: "quotation",
            required: true,
            include: [{
              model: Leads,
              as: "lead",
              required: true,
              where: {
                [Op.or]: [
                  { builder_id: builderId },
                  { company_id: companyId },
                ],
              },
            }],
          },
        ],
        transaction: t,
      });

      if (!existingVersion) {
        await t.rollback();
        return { success: false, message: "Quotation version not found or unauthorized" };
      }

      if (existingVersion.send_to_engineer === true) {
        if (updateData.structure_engineer_id && updateData.structure_engineer_id !== existingVersion.structure_engineer_id) {
          await t.rollback();
          return { success: false, message: "Cannot change the Structural Engineer once the request has been sent to them" };
        }
      }

      // Identify fields being updated
      const updateFields = Object.keys(updateData);
      const isOnlySafeFields = updateFields.every(field =>
        ["upload_report", "structure_engineer_id", "updated_by"].includes(field)
      );

      // Only apply lock checks if updating core quotation data
      if (!isOnlySafeFields) {
        await checkLeadLockStatus(existingVersion.leads_id, t);
        await checkQuotationLockStatus(existingVersion.quotation_id, null, t);

        // If already approved, block all updates to core data
        if (existingVersion.is_approve === true) {
          return {
            success: false,
            message: "This quotation version is already approved and cannot be updated",
          };
        }
      }

      // 3. Sketch number validation on approval
      if (updateData.is_approve === true && !updateData.sketch_number) {
        await t.rollback();
        return { success: false, message: "Sketch number is required when approving a quotation version" };
      }

      // Snapshot the version for the activity log BEFORE anything mutates it.
      // The package swap, the price-list item deletes and the column update all
      // happen further down; taking this snapshot after any of them would make
      // oldData identical to newData, so package and cost changes would compare
      // equal and never be logged.
      const oldVersion = await quotationRepository.getQuotationVersionDetailsById(versionId, t);

      // If floor_plan_id or facade_id is provided but dwelling_type_id / range_id is not set,
      // auto-infer dwelling_type_id and range_id from FloorPlan or Facade.
      if (updateData.floor_plan_id && !updateData.dwelling_type_id && !existingVersion.dwelling_type_id) {
        const fpRecord = await FloorPlan.findByPk(updateData.floor_plan_id, { transaction: t });
        if (fpRecord) {
          if (fpRecord.dwelling_type_id) updateData.dwelling_type_id = fpRecord.dwelling_type_id;
          if (fpRecord.range_id && !updateData.range_id && !existingVersion.range_id) {
            updateData.range_id = fpRecord.range_id;
          }
        }
      } else if (updateData.facade_id && !updateData.dwelling_type_id && !existingVersion.dwelling_type_id) {
        const fRecord = await Facade.findByPk(updateData.facade_id, { transaction: t });
        if (fRecord) {
          if (fRecord.dwelling_type_id) updateData.dwelling_type_id = fRecord.dwelling_type_id;
          if (fRecord.range_id && !updateData.range_id && !existingVersion.range_id) {
            updateData.range_id = fRecord.range_id;
          }
        }
      }

      // 4. Effective IDs for prerequisites
      const effectiveDwellingTypeId = updateData.dwelling_type_id !== undefined
        ? updateData.dwelling_type_id
        : existingVersion.dwelling_type_id;

      const effectiveRangeId = updateData.range_id !== undefined
        ? updateData.range_id
        : existingVersion.range_id;

      // Track floor plan change — needed for facade clearing and price list auto-mapping below
      const previousFloorPlanId = existingVersion.floor_plan_id;
      const floorPlanChanged = updateData.floor_plan_id !== undefined
        && updateData.floor_plan_id !== previousFloorPlanId;

      // Floor plan changed → the old facade belongs to the old floor plan and must be cleared.
      // Only force-clear if the request does NOT explicitly supply a new facade_id.
      if (floorPlanChanged && updateData.facade_id === undefined) {
        updateData.facade_id = null;
      }

      if ((updateData.floor_plan_id || updateData.facade_id) && !effectiveDwellingTypeId) {
        await t.rollback();
        return { success: false, message: "Dwelling type must be selected before setting floor plan or facade" };
      }

      // 5. Foreign Key Validations
      const validations = [
        { field: "location_id", model: Location, pk: "location_id", label: "Location", statusField: "status" },
        { field: "range_id", model: Range, pk: "range_id", label: "Range", statusField: "is_active" },
        { field: "dwelling_type_id", model: DwellingType, pk: "dwelling_type_id", label: "Dwelling Type", statusField: "is_active" },
        { field: "floor_plan_id", model: FloorPlan, pk: "floor_plan_id", label: "Floor Plan", statusField: "status" },
        { field: "facade_id", model: Facade, pk: "facade_id", label: "Facade", statusField: "status" },
      ];

      for (const v of validations) {
        const idValue = updateData[v.field];
        if (idValue && idValue !== null) {
          const record = await v.model.findOne({
            where: {
              [v.pk]: idValue,
              [Op.or]: [
                { company_id: companyId || null },
                { builder_id: builderId || null },
              ],
            },
            transaction: t,
          });

          if (!record) {
            await t.rollback();
            return { success: false, message: `${v.label} not found or does not belong to your organization` };
          }

          if (record[v.statusField] === false) {
            await t.rollback();
            return { success: false, message: `${v.label} is currently inactive` };
          }

          // Consistency check for Floor Plan and Facade
          if (v.field === "floor_plan_id" || v.field === "facade_id") {
            if (record.range_id !== effectiveRangeId) {
              await t.rollback();
              return { success: false, message: `The selected ${v.label} does not match the quotation version's range` };
            }
            if (record.dwelling_type_id !== effectiveDwellingTypeId) {
              await t.rollback();
              return { success: false, message: `The selected ${v.label} does not match the quotation version's dwelling type` };
            }
          }
        }
      }

      // Facade → Floor Plan constraint:
      // If the user is setting a non-null facade_id, verify it is mapped to the currently
      // selected floor plan (if that floor plan has any facade mappings at all).
      // When no mappings exist, any facade matching range + dwelling_type is allowed.
      const effectiveFloorPlanIdForConstraint = updateData.floor_plan_id !== undefined
        ? updateData.floor_plan_id
        : existingVersion.floor_plan_id;

      if (updateData.facade_id && effectiveFloorPlanIdForConstraint) {
        const facadeMappings = await quotationRepository.getFloorPlanFacadeMappings(
          effectiveFloorPlanIdForConstraint,
          t
        );
        // if (facadeMappings.length > 0) {
        //   const mappedFacadeIds = facadeMappings.map((r) => r.facade_id);
        //   if (!mappedFacadeIds.includes(updateData.facade_id)) {
        //     return {
        //       success: false,
        //       message: "The selected Facade is not mapped to the selected Floor Plan",
        //     };
        //   }
        // }
      }

      // Handle facade_price snapshotting
      if (updateData.facade_id !== undefined) {
        if (updateData.facade_id === null) {
          updateData.facade_price = 0;
        } else {
          const { Facade } = db;
          const facade = await Facade.findOne({
            attributes: ["cost"],
            where: {
              facade_id: updateData.facade_id,
            },
            transaction: t,
          });
          if (facade) {
            updateData.facade_price = facade.cost || 0;
          }
        }
      }

      // Handle structure_engineer_id: validate and auto-populate price from StructureEngineer
      if (updateData.structure_engineer_id !== undefined) {
        if (updateData.structure_engineer_id === null) {
          updateData.structure_engineer_price = null;
        } else {
          const engineer = await StructureEngineer.findOne({
            where: {
              structure_engineer_id: updateData.structure_engineer_id,
              [Op.or]: [
                { company_id: companyId || null },
                { builder_id: builderId || null },
              ],
            },
            transaction: t,
          });

          if (!engineer) {
            await t.rollback();
            return { success: false, message: "Structure engineer not found or does not belong to your organization" };
          }

          if (engineer.is_active === false) {
            await t.rollback();
            return { success: false, message: "Structure engineer is currently inactive" };
          }

          if (updateData.structure_engineer_price === undefined) {
            updateData.structure_engineer_price = engineer.price;
          }
        }
      }

      // 7. Handle Range/Dwelling Type Change (Snapshot Clearing)
      const rangeChanged = updateData.range_id !== undefined && updateData.range_id !== existingVersion.range_id;
      const dwellingTypeChanged = updateData.dwelling_type_id !== undefined && updateData.dwelling_type_id !== existingVersion.dwelling_type_id;

      if (rangeChanged || dwellingTypeChanged) {
        if (updateData.facade_id === undefined) {
          updateData.facade_id = null;
          // Clear the snapshot price with it. This block runs AFTER the
          // facade_price snapshotting above, so that block never sees this
          // clearing — without the line below the version kept charging for a
          // facade it no longer has. The charge is invisible on the quotation
          // (no facade to name) but grand_total_cost still adds
          // COALESCE(facade_price, 0), which is how a Grand Total ends up far
          // larger than the sum of everything printed. Note the engineer four
          // lines down already nulls its price for exactly this reason.
          updateData.facade_price = 0;
        }
        if (updateData.floor_plan_id === undefined) {
          updateData.floor_plan_id = null;
        }
        if (updateData.package_id === undefined) {
          updateData.package_id = null;
        }
        if (updateData.structure_engineer_id === undefined) {
          updateData.structure_engineer_id = null;
          updateData.structure_engineer_price = null;
        }

        // Fetch property details to check compaction report status
        const lead = await Leads.findByPk(existingVersion.quotation?.leads_id, {
          include: [{ model: PropertyDetail, as: "propertyDetail" }],
          transaction: t,
        });

        const propertyDetail = lead?.propertyDetail;
        const isCompactionMandatory = propertyDetail &&
          propertyDetail.compaction_report === "not_available" &&
          propertyDetail.compaction_report_provider === "builder";

        // Delete related pricelist item mappings
        if (isCompactionMandatory) {
          await QuotationVersionPricelistItemMap.destroy({
            where: {
              quotation_version_id: versionId,
              price_list_item_id: {
                [Op.notIn]: db.sequelize.literal("(SELECT price_list_item_id FROM price_list_item WHERE item_description = 'Compaction Report Charge')"),
              },
            },
            transaction: t,
          });

          await QuotationVersionItem.destroy({
            where: {
              quotation_version_id: versionId,
              [Op.or]: [
                { price_list_item_description: { [Op.ne]: "Compaction Report Charge" } },
                { package_id: { [Op.not]: null } },
              ],
            },
            transaction: t,
          });
        } else {
          await QuotationVersionPricelistItemMap.destroy({
            where: { quotation_version_id: versionId },
            transaction: t,
          });
          await QuotationVersionItem.destroy({
            where: { quotation_version_id: versionId },
            transaction: t,
          });
        }

        // The branch above can only *keep* a charge row that is already there.
        // A version created before the property was switched to "builder
        // supplies the compaction report" has no such row, so changing the
        // range re-wiped the items and still left the charge missing. Re-sync
        // so it is created when it applies — and stays gone when it does not.
        await syncCompactionReportCharge(
          existingVersion.quotation?.leads_id,
          builderId,
          companyId,
          userId,
          t,
        );
      }

      // 8. Package Validation
      if (updateData.package_id) {
        if (!effectiveRangeId || !effectiveDwellingTypeId) {
          await t.rollback();
          return { success: false, message: "Range and Dwelling type must be selected before adding a package" };
        }

        const pkg = await Package.findOne({
          where: {
            package_id: updateData.package_id,
            status: true,
            [Op.or]: [
              { company_id: companyId || null },
              { builder_id: builderId || null },
            ],
            range_id: { [Op.contains]: [effectiveRangeId] },
            dwelling_type_id: { [Op.contains]: [effectiveDwellingTypeId] },
          },
          transaction: t,
        });

        if (!pkg) {
          await t.rollback();
          return { success: false, message: "The provided package ID is invalid, inactive, or does not match the selected range and dwelling type" };
        }
      }

      // Handle package_id snapshotting: 
      // If package_id is explicitly being updated (even to null), manage the snapshots.
      if (updateData.package_id !== undefined) {
        // 1. Clear any existing package snapshot for this version
        await quotationRepository.removePackageFromVersion(versionId, null, builderId, companyId, t);

        // 2. If a new package is selected, snapshot it
        if (updateData.package_id !== null) {
          const { Package } = db;
          const pkg = await Package.findOne({
            where: { package_id: updateData.package_id },
            attributes: ["package_id", "name", "cost"],
            transaction: t
          });
          if (pkg) {
            await quotationRepository.addPackageSnapshot(versionId, pkg, t);
          }
        }
      }

      // upload_report cleanup has moved out of this branch — the controller
      // upserts a DriveFile (sub_reference_type=StructureEngineerUpload)
      // BEFORE this service runs, and the upsert overwrites the existing
      // record's s3_key in place. No reconciliation needed here.

      updateData.updated_by = userId;

      const updated = await quotationRepository.updateQuotationVersion(versionId, updateData, t);
      await quotationRepository.clearPdfUrl(versionId, t);

      // Floor Plan price list item auto-mapping.
      // Only runs when floor_plan_id is explicitly included in the update payload.
      if (updateData.floor_plan_id !== undefined) {
        // If the floor plan changed, remove items that were auto-mapped from the OLD floor plan.
        // Manually added items (not in the old floor plan's mapping) are preserved.
        if (floorPlanChanged && previousFloorPlanId) {
          await quotationRepository.removeFloorPlanPricelistItems(versionId, previousFloorPlanId, t);
        }
        // If the new floor plan is non-null, insert its mapped price list items (duplicates skipped).
        if (updateData.floor_plan_id) {
          await quotationRepository.autoMapFloorPlanPricelistItems(versionId, updateData.floor_plan_id, t);
        }
      }

      // Facade / floor-plan image clones are kept in sync by the
      // QuotationVersion afterUpdate hook (it re-clones only the image type
      // whose FK actually changed). No inline sync needed here.

      if (!updated) {
        await t.rollback();
        return { success: false, message: "No valid fields provided for update" };
      }

      const newVersion = await quotationRepository.getQuotationVersionDetailsById(versionId, t);
      const leadId = existingVersion.quotation?.lead?.leads_id;
      const refNo = existingVersion.quotation?.reference_number;

      if (leadId) {
        await compareAndLogUpdates(t, {
          userId,
          builderId,
          companyId,
          referenceId: leadId,
          referenceType: "LEAD",
          module: "Quotation",
          moduleId: existingVersion.quotation_id,
          recordName: refNo,
          oldData: oldVersion,
          newData: newVersion,
          metadata: { quotationVersionNo: newVersion.quotationVersionNo },
          ignoreFields: ['quotationVersionItems', 'leadContacts', 'property', 'versions']
        });
      }

      await t.commit(); // <-- FIX: Commit transaction to release Sequelize connection

      // Trigger PDF generation in background
      pdfQueue.add("pdfGeneration", {
        quotation_version_id: versionId,
        builder_id: builderId,
        company_id: companyId
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true
      }).catch(err => console.error("Error adding PDF generation job:", err));

      return {
        success: true,
        data: newVersion,
        message: "Quotation version updated successfully",
      };
    } catch (error) {
      if (t) {
        await t.rollback();
      }
      console.error("DEBUG: Error in updateQuotationVersion service:", error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Fetch a QuotationVersion with every association needed to build the
   * Engineering Requirement PDF. All data comes from quotation_version and its
   * Sequelize associations — the job_form table is intentionally NOT used.
   */
  async _fetchQuotationVersionForEngineer(versionId) {
    const {
      QuotationVersion, StructureEngineer, Quotation, Leads, PropertyDetail,
      Location, Range, DwellingType, FloorPlan, Facade, Package,
    } = db.sequelize?.models || db;

    return QuotationVersion.findOne({
      where: { quotation_version_id: versionId },
      include: [
        { model: StructureEngineer, as: "structureEngineer" },
        {
          model: Quotation,
          as: "quotation",
          include: [
            {
              model: Leads,
              as: "lead",
              include: [{ model: PropertyDetail, as: "propertyDetail" }],
            },
          ],
        },
        { model: Location, as: "location", attributes: ["name"] },
        { model: Range, as: "range", attributes: ["name", "logo_url", "header_url"] },
        { model: DwellingType, as: "dwellingType", attributes: ["name"] },
        {
          model: FloorPlan,
          as: "floorPlan",
          attributes: [
            "name", "description", "beds", "baths", "carpark", "living",
            "dwelling_area", "total_area", "garage_area", "porch_area",
            "alfresco_area", "min_land_width", "min_land_depth",
            "detailed_image", "simple_image",
          ],
        },
        { model: Facade, as: "facade", attributes: ["name", "cost_type", "cost", "builder_cost", "image"] },
        { model: Package, as: "package", attributes: ["name", "cost", "builder_cost"] },
      ],
    });
  }

  /**
   * Resolve the selected package for a quotation version. The quotation
   * builder UI stores the selection as snapshot rows in
   * quotation_version_items and (historically) never set
   * quotation_version.package_id, so the belongsTo include can be null even
   * though a package is selected — fall back to the snapshot row.
   */
  async _resolveEngineerPdfPackage(versionPlain) {
    if (versionPlain.package) return { ...versionPlain.package };
    if (!versionPlain.quotation_version_id) return null;

    const { QuotationVersionItem } = db.sequelize?.models || db;
    const snapshot = await QuotationVersionItem.findOne({
      where: {
        quotation_version_id: versionPlain.quotation_version_id,
        package_id: { [Op.ne]: null },
      },
      attributes: ["package_name", "package_cost", "package_builder_cost"],
    });

    return snapshot
      ? {
        name: snapshot.package_name,
        cost: snapshot.package_cost,
        builder_cost: snapshot.package_builder_cost,
      }
      : null;
  }

  /**
   * Build the nested pdfData object consumed by generateEngineerPdfHtml
   * (the old "Engineering Spec" template).
   *
   * Image URLs (range logo/header, floor plan images, facade image) are
   * downloaded from S3 and inlined as data URIs so Puppeteer can render
   * deterministically offline. The compaction report URL is replaced with
   * a presigned download link.
   */
  async _buildEngineerPdfData(versionPlain) {
    const lead = versionPlain.quotation?.lead || {};
    const property = lead.propertyDetail || lead.property_detail || null;

    const range = versionPlain.range ? { ...versionPlain.range } : null;
    const floorPlan = versionPlain.floorPlan ? { ...versionPlain.floorPlan } : null;
    const facade = versionPlain.facade ? { ...versionPlain.facade } : null;
    const pkg = await this._resolveEngineerPdfPackage(versionPlain);
    const propertyDetail = property ? { ...property } : null;

    // FloorPlan/Facade store image fields as DriveFile UUIDs. Their afterFind
    // hooks only fire for direct queries, not nested includes — so when loaded
    // through QuotationVersion we still see raw UUIDs. Resolve them to s3_keys
    // in a single batched lookup.
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUuid = (v) => typeof v === "string" && uuidRe.test(v);
    const uuidsToResolve = [
      floorPlan?.detailed_image,
      floorPlan?.simple_image,
      facade?.image,
    ].filter(isUuid);

    const uuidToKey = new Map();
    if (uuidsToResolve.length) {
      const { DriveFile } = db.sequelize?.models || db;
      const rows = await DriveFile.findAll({
        where: { file_id: uuidsToResolve },
        attributes: ["file_id", "s3_key"],
      });
      rows.forEach((r) => uuidToKey.set(r.file_id, r.s3_key));
    }
    const resolveImage = (val) => (isUuid(val) ? uuidToKey.get(val) || null : val);

    if (floorPlan) {
      floorPlan.detailed_image = resolveImage(floorPlan.detailed_image);
      floorPlan.simple_image = resolveImage(floorPlan.simple_image);
    }
    if (facade) {
      facade.image = resolveImage(facade.image);
    }

    // toDataUri (shared with the quotation PDF inliner) downloads each image
    // with a per-attempt timeout, retries once, and caches successful
    // downloads by S3 key — so a slow link only has to win once per image.

    // Inline all images and presign the compaction report in parallel — each
    // is an independent S3 round-trip. Running them serially (as before) added
    // ~N×latency on top of PDF generation for no reason.
    // compaction_report_url is a DriveFile UUID FK here (nested include, so the
    // afterFind hook hasn't resolved it) — map it to the real s3_key.
    const compactionKey = propertyDetail?.compaction_report_url
      ? await resolveCompactionS3Key(propertyDetail.compaction_report_url)
      : null;

    const [
      rangeLogo,
      rangeHeader,
      fpDetailed,
      facadeImg,
      compactionPresign,
    ] = await Promise.all([
      range ? toDataUri(range.logo_url) : null,
      range ? toDataUri(range.header_url) : null,
      floorPlan ? toDataUri(floorPlan.detailed_image) : null,
      facade ? toDataUri(facade.image) : null,
      compactionKey
        ? generatePresignedDownloadUrl(compactionKey, 604800).catch((err) => {
          console.error("[EngineeringRequirement] Failed to presign compaction report:", err.message);
          return null;
        })
        : null,
    ]);

    // The template only uses simple_image as a fallback when detailed_image is
    // absent — skip the download entirely when the detailed image resolved, so
    // it doesn't compete for bandwidth with the images that actually render.
    const fpSimple = floorPlan && !fpDetailed ? await toDataUri(floorPlan.simple_image) : null;

    if (range) {
      range.logo_url = rangeLogo;
      range.header_url = rangeHeader;
    }
    if (floorPlan) {
      floorPlan.detailed_image = fpDetailed;
      floorPlan.simple_image = fpSimple;
    }
    if (facade) {
      facade.image = facadeImg;
    }

    if (propertyDetail?.compaction_report_url) {
      propertyDetail.compaction_report_download_url =
        (compactionPresign?.success && compactionPresign.url) || propertyDetail.compaction_report_url;
    }

    return {
      range,
      dwellingType: versionPlain.dwellingType || null,
      floorPlan,
      facade,
      package: pkg,
      propertyDetail,
      uploadReport: null,
      structureEngineerReport: null,
      leadId: lead.leads_id || null,
      versionId: versionPlain.quotation_version_id || null,
    };
  }

  /**
   * Data for the slide-over "Mail to Structural Engineer" panel: engineer
   * contact, presence/links of both PDFs, the active email templates, and the
   * send_to_engineer flag.
   */
  async getEngineerMailPreview(versionId, builderId, companyId) {
    try {
      const { QuotationVersion, StructureEngineer, TemplateEmail, Quotation, Leads, PropertyDetail } =
        db.sequelize?.models || db;

      const quotationVersion = await QuotationVersion.findOne({
        where: { quotation_version_id: versionId },
        attributes: ["quotation_version_id", "send_to_engineer", "structure_engineer_id"],
        include: [
          { model: StructureEngineer, as: "structureEngineer", attributes: ["name", "email", "phone"] },
          {
            model: Quotation,
            as: "quotation",
            attributes: ["quotation_id"],
            include: [
              {
                model: Leads,
                as: "lead",
                attributes: ["leads_id"],
                include: [
                  { model: PropertyDetail, as: "propertyDetail", attributes: ["property_detail_id", "compaction_report_url"] },
                ],
              },
            ],
          },
        ],
      });

      if (!quotationVersion) {
        return { success: false, message: "Quotation version not found" };
      }

      const engineer = quotationVersion.structureEngineer;
      const compactionUrlRaw = quotationVersion.quotation?.lead?.propertyDetail?.compaction_report_url || null;

      const [engReqFile, emailTemplates] = await Promise.all([
        getQuotationDriveFile(versionId, DRIVE_FILE_MAPPING.SUB_REFERENCES.ENGINEERING_REQUIREMENT),
        TemplateEmail.findAll({
          where: {
            is_active: true,
            [Op.or]: [
              ...(builderId ? [{ builder_id: builderId }] : []),
              ...(companyId ? [{ company_id: companyId }] : []),
            ],
          },
          attributes: ["template_email_id", "name", "subject", "email_content"],
          order: [["name", "ASC"]],
        }),
      ]);

      const presignedFor = async (file, subRef) =>
        file?.s3_key ? await getQuotationDriveFilePresignedUrl(versionId, subRef) : null;

      const engReqUrl = await presignedFor(engReqFile, DRIVE_FILE_MAPPING.SUB_REFERENCES.ENGINEERING_REQUIREMENT);

      // compaction_report_url is a DriveFile UUID FK (nested include here, so the
      // afterFind hook hasn't resolved it to a URL) — map it to the real s3_key
      // before presigning, otherwise we'd sign the UUID and get NoSuchKey.
      let compactionUrl = null;
      const compactionKey = await resolveCompactionS3Key(compactionUrlRaw);
      if (compactionKey) {
        const presigned = await generatePresignedDownloadUrl(compactionKey);
        compactionUrl = presigned?.success ? presigned.url : null;
      }

      return {
        success: true,
        data: {
          engineer: engineer
            ? { name: engineer.name || null, email: engineer.email || null, phone: engineer.phone || null }
            : null,
          engineeringRequirement: {
            exists: !!engReqFile,
            fileId: engReqFile?.file_id || null,
            presignedUrl: engReqUrl,
          },
          compactionReport: {
            exists: !!compactionUrlRaw,
            presignedUrl: compactionUrl,
          },
          emailTemplates: (emailTemplates || []).map((t) => ({
            templateEmailId: t.template_email_id,
            name: t.name,
            subject: t.subject,
            emailContent: t.email_content,
          })),
          sendToEngineer: !!quotationVersion.send_to_engineer,
        },
        message: "Engineer mail preview fetched successfully",
      };
    } catch (error) {
      console.error("Error in getEngineerMailPreview:", error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Generate the Engineering Requirement PDF fresh from QuotationVersion data,
   * store it in S3 + drive_files, and return a presigned URL for preview.
   * Safe to call repeatedly — upsertQuotationDriveFile overwrites the existing
   * active row (partial unique index), so re-generating replaces the file.
   */
  async generateEngineeringRequirement(versionId, builderId, companyId, userId) {
    try {
      const t0 = Date.now();
      const quotationVersion = await this._fetchQuotationVersionForEngineer(versionId);

      if (!quotationVersion) {
        return { success: false, message: "Quotation version not found" };
      }
      const tFetch = Date.now();

      const versionPlain = quotationVersion.get({ plain: true });
      const pdfData = await this._buildEngineerPdfData(versionPlain);
      const tBuild = Date.now();

      const html = generateEngineerPdfHtml(pdfData);
      const buffer = await generatePDF(html);
      const tPdf = Date.now();

      const s3Key = `engineering-requirements/qv_${versionId}_${Date.now()}.pdf`;
      const uploadResult = await uploadFile(s3Key, buffer, "application/pdf");
      const tUpload = Date.now();
      console.log(
        `[EngReq] timings ms — dbFetch:${tFetch - t0} buildData(imgDL):${tBuild - tFetch} pdf:${tPdf - tBuild} upload:${tUpload - tPdf} total:${tUpload - t0}`,
      );
      if (!uploadResult?.success) {
        return { success: false, message: "Failed to upload Engineering Requirement PDF" };
      }

      // The DriveFile upsert and the presigned-URL generation are independent
      // once we have the s3Key — run them in parallel. Skipping the secondary
      // DB lookup in getQuotationDriveFilePresignedUrl saves one round-trip.
      const [, presignedResult] = await Promise.all([
        upsertQuotationDriveFile({
          versionId,
          subReferenceType: DRIVE_FILE_MAPPING.SUB_REFERENCES.ENGINEERING_REQUIREMENT,
          s3Key,
          size: buffer.length,
          originalName: "Engineering_Requirement.pdf",
          mimeType: "application/pdf",
          builderId,
          companyId,
          uploadedBy: userId,
        }),
        generatePresignedDownloadUrl(s3Key, 3600),
      ]);
      const presignedUrl = presignedResult?.success ? presignedResult.url : null;

      return {
        success: true,
        data: { presignedUrl },
        message: "Engineering Requirement generated successfully",
      };
    } catch (error) {
      console.error("Error in generateEngineeringRequirement:", error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Send the engineering request email to the structural engineer with the
   * Engineering Requirement PDF (and Completion Report, if uploaded) attached.
   *
   * Attachments are passed as S3 keys (attachmentKeys) — the notificationWorker
   * downloads bytes at send time. Storing base64 PDFs in the Bull job payload
   * pushed Redis past maxmemory and caused queueing to fail with OOM.
   */
  // Mirrors sendQuotationEmail: do only cheap validation here, then hand the
  // heavy work (attachment resolution, HTML render, SMTP send, status update)
  // off to engineerEmailWorker via the Bull/Redis queue so the HTTP request
  // returns immediately instead of blocking on PDF download + Gmail upload.
  async sendEngineerEmail(versionId, builderId, companyId, emailData = {}) {
    try {
      const quotationVersion = await this._fetchQuotationVersionForEngineer(versionId);

      if (!quotationVersion) {
        return { success: false, message: "Quotation version not found" };
      }

      const engineer = quotationVersion.structureEngineer;
      if (!engineer || !engineer.email) {
        return { success: false, message: "Structure Engineer does not have a valid email address" };
      }

      // Fail fast if the Engineering Requirement PDF isn't ready — no point
      // queuing a job that the worker would only reject.
      const engReqKey = await getQuotationDriveFileS3Key(
        versionId,
        DRIVE_FILE_MAPPING.SUB_REFERENCES.ENGINEERING_REQUIREMENT,
      );
      if (!engReqKey) {
        return {
          success: false,
          message: "Engineering Requirement PDF is missing. Please generate it again before sending.",
        };
      }

      await emailQueue.add(
        "engineerEmail",
        { versionId, builderId, companyId, emailData },
        { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: true },
      );

      return { success: true, message: "Engineer email is being processed and will be sent shortly" };
    } catch (error) {
      console.error("Error queuing engineer email:", error);
      return { success: false, message: error.message };
    }
  }

  async syncQuotationFromHLP(leadsId, houseLandPackageId, userId, builderId, companyId, transaction = null) {
    const {
      HouseLandPackage, Facade, Quotation, QuotationVersion,
      HLPackagePricelistItemMap, QuotationVersionItem, sequelize
    } = db;
    const isExternalTransaction = !!transaction;
    const t = transaction || await sequelize.transaction();
    try {
      // 1. Fetch HLP details
      const hlp = await HouseLandPackage.findByPk(houseLandPackageId, {
        include: [{ model: Facade, as: "facade", attributes: ["location_id", "cost"] }],
        transaction: t,
      });

      if (!hlp) {
        await t.rollback();
        return { success: false, message: "House Land Package not found" };
      }

      await checkLeadLockStatus(leadsId, t);

      // Check if any other quotation versions exist for this lead
      const existingVersion = await QuotationVersion.findOne({
        include: [{
          model: Quotation,
          as: "quotation",
          where: { leads_id: leadsId }
        }],
        transaction: t
      });

      const hlpConvertStatus = existingVersion ? "Negotiation" : "Proposal";

      // 2. Generate Reference Number
      const reference_number = await generateDynamicReferenceNumber({
        prefix: "QT",
        tableName: "quotation",
        column: "reference_number",
        user: null,
        transaction: t,
      });

      // 3. Create Quotation
      const quotation = await Quotation.create(
        {
          leads_id: leadsId,
          reference_number,
          created_by: userId,
          is_hl_package_quotation: true,
        },
        { transaction: t },
      );

      // 4. Create Quotation Version
      const quotationVersion = await QuotationVersion.create({
        quotation_id: quotation.quotation_id,
        quotation_version_no: 1,
        location_id: hlp.facade?.location_id || null,
        range_id: hlp.range_id,
        dwelling_type_id: hlp.dwelling_type_id,
        floor_plan_id: hlp.floor_plan_id,
        facade_id: hlp.facade_id,
        is_approve: false,
        package_id: null,
        facade_price: hlp.facade?.cost || 0,
      }, { transaction: t });

      // Facade / floor-plan images are cloned by the QuotationVersion afterCreate hook.

      // 5. Copy Pricelist Items from HLP
      const hlpItems = await HLPackagePricelistItemMap.findAll({
        where: { house_land_package_id: houseLandPackageId },
        transaction: t,
      });

      if (hlpItems.length > 0) {
        await QuotationVersionItem.bulkCreate(
          hlpItems.map((item) => ({
            quotation_version_id: quotationVersion.quotation_version_id,
            price_list_id: item.price_list_id,
            price_list_name: item.price_list_name,
            price_list_item_id: item.price_list_item_id,
            price_list_item_description: item.price_list_item_description,
            price_list_item_short_description: item.price_list_item_short_description,
            price_list_item_cost_type: item.price_list_item_cost_type,
            price_list_item_cost_option: item.price_list_item_cost_option,
            price_list_item_cost: item.price_list_item_cost,
            price_list_item_builder_cost: item.price_list_item_builder_cost,
            price_list_item_uom: item.price_list_item_uom,
            quantity: item.quantity,
            note: item.note,
            total_price: item.total_price,
          })),
          { transaction: t },
        );
      }

      // 6. Auto-convert lead to opportunity
      await leadsService.convertLeadToOpportunity(leadsId, null, builderId, companyId, hlpConvertStatus, t);

      // Log Activity
      await logActivity(t, {
        userId,
        builderId,
        companyId,
        referenceId: leadsId,
        referenceType: "LEAD",
        module: "Quotation",
        moduleId: quotation.quotation_id,
        recordName: reference_number,
        action: "CREATE",
        description: `Quotation synced from HLP: ${reference_number}`,
      });

      if (!isExternalTransaction) await t.commit();
      return {
        success: true,
        data: quotation,
        message: "Quotation created from House Land Package successfully",
      };
    } catch (error) {
      if (!isExternalTransaction && t) await t.rollback();
      console.error("DEBUG: Error in syncQuotationFromHLP:", error);
      return { success: false, message: error.message };
    }
  }

  async duplicateQuotationVersion(versionId, builderId, companyId, userId) {
    const {
      QuotationVersion, Quotation, Leads,
      QuotationVersionItem, QuotationVersionCustomSection,
    } = db;
    const t = await db.sequelize.transaction();

    try {
      // 1. Fetch source version and verify ownership
      const sourceVersion = await QuotationVersion.findOne({
        where: { quotation_version_id: versionId },
        include: [{
          model: Quotation,
          as: "quotation",
          include: [{
            model: Leads,
            as: "lead",
            where: {
              [Op.or]: [
                { builder_id: builderId },
                { company_id: companyId },
              ],
            },
          }],
        }],
        transaction: t,
      });

      if (!sourceVersion) {
        await t.rollback();
        return { success: false, message: "Quotation version not found or unauthorized" };
      }

      const quotationId = sourceVersion.quotation_id;

      // 2. Get the next version number
      const maxVersion = await QuotationVersion.max('quotation_version_no', {
        where: { quotation_id: quotationId },
        transaction: t
      });
      const newVersionNo = (maxVersion || 0) + 1;

      // 3. Create the new quotation version (resetting approval and sketch number)
      const newVersion = await QuotationVersion.create({
        quotation_id: quotationId,
        quotation_version_no: newVersionNo,
        location_id: sourceVersion.location_id,
        range_id: sourceVersion.range_id,
        dwelling_type_id: sourceVersion.dwelling_type_id,
        floor_plan_id: sourceVersion.floor_plan_id,
        facade_id: sourceVersion.facade_id,
        is_approve: false,
        structure_engineer_id: sourceVersion.structure_engineer_id || null,
        structure_engineer_price: sourceVersion.structure_engineer_price || 0,
        sketch_number: sourceVersion.sketch_number || null,
        package_id: sourceVersion.package_id || null,
        facade_price: sourceVersion.facade_price || 0,
      }, { transaction: t });

      const newVersionId = newVersion.quotation_version_id;

      // Facade / floor-plan images are cloned by the QuotationVersion afterCreate hook.

      // 4. Copy quotation version items (Snapshots)
      const oldItems = await QuotationVersionItem.findAll({
        where: { quotation_version_id: versionId },
        transaction: t
      });

      if (oldItems.length > 0) {
        await QuotationVersionItem.bulkCreate(
          oldItems.map(item => {
            const itemJson = item.get({ plain: true });
            delete itemJson.quotation_version_item_id;
            delete itemJson.created_at;
            delete itemJson.updated_at;
            return {
              ...itemJson,
              quotation_version_id: newVersionId,
            };
          }),
          { transaction: t }
        );
      }

      // 5. Copy custom sections
      await db.sequelize.query(`
        INSERT INTO quotation_version_custom_section (
          quotation_version_id, file_url, sort_order, created_at, updated_at
        )
        SELECT $1, file_url, sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM quotation_version_custom_section
        WHERE quotation_version_id = $2
      `, {
        bind: [newVersionId, versionId],
        type: db.sequelize.QueryTypes.INSERT,
        transaction: t,
      });

      // 6. Sync compaction report charge
      await syncCompactionReportCharge(sourceVersion.quotation?.leads_id, builderId, companyId, userId, t);

      // 7. Convert Lead to Opportunity (Negotiation)
      await leadsService.convertLeadToOpportunity(sourceVersion.quotation?.leads_id, null, builderId, companyId, "Negotiation", t);

      // 8. Log Activity
      await logActivity(t, {
        userId,
        builderId,
        companyId,
        referenceId: sourceVersion.quotation?.leads_id,
        referenceType: "LEAD",
        module: "Quotation",
        moduleId: quotationId,
        recordName: sourceVersion.quotation?.reference_number,
        action: "CREATE",
        description: `Quotation version duplicated: Version ${newVersionNo}`,
      });

      // Fetch fully enriched new version
      const result = await quotationRepository.getQuotationVersionDetailsById(newVersionId, t);

      await t.commit();

      return {
        success: true,
        data: result,
        message: "Quotation version duplicated successfully",
      };
    } catch (error) {
      if (t) await t.rollback();
      console.error("DEBUG: Error in duplicateQuotationVersion service:", error);
      return { success: false, message: error.message };
    }
  }

  async deleteQuotation(quotationId, builderId, companyId, userId) {
    try {
      const { Quotation, Leads } = db.sequelize.models;
      const quotation = await Quotation.findOne({
        where: { quotation_id: quotationId },
        include: [{
          model: Leads,
          as: "lead",
          where: {
            [Op.or]: [
              { builder_id: builderId },
              ...(companyId ? [{ company_id: companyId }] : [])
            ]
          }
        }]
      });

      if (!quotation) {
        return { success: false, message: "Quotation not found or unauthorized" };
      }

      await checkLeadLockStatus(quotation.leads_id);
      const deleted = await quotationRepository.deleteQuotation(quotationId);

      await logActivity(null, {
        userId,
        builderId,
        companyId,
        referenceId: quotation.leads_id,
        referenceType: "LEAD",
        module: "Quotation",
        moduleId: quotationId,
        recordName: "Quotation",
        action: "DELETE",
        description: "Quotation deleted",
      });

      return {
        success: true,
        data: deleted,
        message: "Quotation deleted successfully",
      };
    } catch (error) {
      console.error("DEBUG: Error in deleteQuotation service:", error);
      return { success: false, message: error.message };
    }
  }

  async getQuotationPDF(versionId, builderId, companyId) {
    try {
      const { QuotationVersion, Quotation, Leads } = db.sequelize?.models || db;

      // 1. Parallelize initial check and metadata fetch
      const [sourceVersion, versionDetails] = await Promise.all([
        QuotationVersion.findOne({
          where: { quotation_version_id: versionId },
          include: [{
            model: Quotation,
            as: "quotation",
            include: [{
              model: Leads,
              as: "lead",
              where: {
                [Op.or]: [
                  { builder_id: builderId },
                  ...(companyId ? [{ company_id: companyId }] : []),
                ],
              },
            }],
          }],
        }),
        quotationRepository.getQuotationVersionDetailsById(versionId)
      ]);

      if (!sourceVersion || !versionDetails) {
        return { success: false, message: "Quotation version not found or unauthorized" };
      }

      const fileName = `Quotation_v${versionDetails.quotationVersionNo}.pdf`;

      // Always regenerate so the preview reflects the latest quotation edits.
      // The cached DriveFile/S3 object is never trusted here — we rebuild the
      // PDF, overwrite the deterministic S3 key, and upsert the DriveFile row
      // (which other read paths, e.g. email/engineer preview, then resolve).
      //
      // Generate fresh PDF, upload to S3, save DriveFile + column FK.
      // Resolve DriveFile-UUID image refs and inline them as data URIs first —
      // the raw-SQL details query bypasses the afterFind URL hooks, so the
      // floor plan / facade images would otherwise be bare UUIDs.
      await inlineQuotationPdfImages(versionDetails);
      const htmlContent = generateQuotationHTML(versionDetails);
      const pdfBuffer = await generatePDF(htmlContent);

      const newS3Key = `quotations/${versionId}/${fileName}`;
      const uploadResult = await uploadFile(newS3Key, pdfBuffer, "application/pdf");

      if (uploadResult.success) {
        await quotationRepository.updatePdfUrl(versionId, uploadResult.key, {
          size: pdfBuffer.length,
          originalName: fileName,
          builderId,
          companyId,
        });
      }

      const presigned = uploadResult.success ? await generatePresignedDownloadUrl(uploadResult.key) : null;
      return {
        success: true,
        data: {
          pdfBuffer,
          fileName,
          pdfUrl: presigned?.success ? presigned.url : uploadResult.success ? uploadResult.location : null,
          s3Key: uploadResult.success ? uploadResult.key : null,
        },
      };
    } catch (error) {
      console.error("DEBUG: Error in getQuotationPDF service:", error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async sendQuotationEmail(versionId, userId, builderId, companyId) {
    try {
      const { QuotationVersion, Quotation, Leads } = db.sequelize.models;
      const version = await QuotationVersion.findOne({
        where: { quotation_version_id: versionId },
        include: [{
          model: Quotation,
          as: "quotation",
          include: [{
            model: Leads,
            as: "lead",
            where: {
              [Op.or]: [
                { builder_id: builderId },
                ...(companyId ? [{ company_id: companyId }] : [])
              ]
            }
          }]
        }]
      });

      if (!version) {
        return { success: false, message: "Quotation version not found or unauthorized" };
      }

      if (!version.quotation?.lead?.email) {
        return { success: false, message: "Customer email not available for this quotation" };
      }

      await pdfQueue.add(
        "quotationEmail",
        { versionId, userId, builderId, companyId },
        { attempts: 3, backoff: { type: "exponential", delay: 5000 } }
      );

      return { success: true, message: "Quotation email is being processed and will be sent shortly" };
    } catch (error) {
      console.error("Error queuing quotation email:", error);
      return { success: false, message: error.message };
    }
  }

  async getQuotationByHash(hash) {
    try {
      const { quotationId, leadId } = decodeQuotationHash(hash);
      const { Quotation } = db.sequelize.models;

      // 1. Verify ownership and existence
      const quotation = await Quotation.findOne({
        where: {
          quotation_id: quotationId,
          leads_id: leadId,
        },
      });

      if (!quotation) {
        return { success: false, message: "Quotation not found" };
      }

      // 2. Fetch all detailed versions using the repository method
      const versions = await quotationRepository.getVersionsByQuotationId(quotationId);

      return { success: true, data: versions };
    } catch (error) {
      console.error("Error in getQuotationByHash:", error);
      return { success: false, message: "Invalid or expired link" };
    }
  }

  async compareQuotationVersions(leadsId, versions, showAll, builderId, companyId) {
    try {
      const { QuotationVersion, Quotation, Leads, PropertyDetail, State } = db.sequelize?.models || db;
      const versionId1 = versions[0].version_id;
      const quotationId1 = versions[0].quotation_id;
      const versionId2 = versions[1].version_id;
      const quotationId2 = versions[1].quotation_id;

      // 1. Ownership and sanity checks for both versions
      const checkResults = await QuotationVersion.findAll({
        where: { quotation_version_id: { [Op.in]: [versionId1, versionId2] } },
        include: [{
          model: Quotation,
          as: "quotation",
          include: [{
            model: Leads,
            as: "lead",
            where: {
              leads_id: leadsId,
              [Op.or]: [
                { builder_id: builderId },
                ...(companyId ? [{ company_id: companyId }] : []),
              ],
            },
          }],
        }],
      });

      if (checkResults.length < 2 && versionId1 !== versionId2) {
        return { success: false, message: "One or both quotation versions not found or unauthorized for this lead" };
      }

      const v1Row = checkResults.find(r => r.quotation_version_id === versionId1);
      const v2Row = checkResults.find(r => r.quotation_version_id === versionId2);

      if (!v1Row || !v2Row) {
        return { success: false, message: "Could not find matching version data" };
      }

      const v1Quotation = v1Row.quotation;
      const v2Quotation = v2Row.quotation;

      if (v1Quotation?.quotation_id !== quotationId1 || v2Quotation?.quotation_id !== quotationId2) {
        return { success: false, message: "Version does not belong to the specified quotation" };
      }

      // 2. Fetch property details
      const fetchPropertyDetails = async (propertyDetailId) => {
        if (!propertyDetailId) {
          return null;
        }
        const pd = await PropertyDetail.findByPk(propertyDetailId, {
          include: [{ model: State, as: "state" }],
        });
        if (pd) {
          return {
            lotNumber: pd.lot_number,
            street: pd.street,
            addressLine1: pd.address_line1,
            city: pd.city,
            state: pd.state?.name,
            zipCode: pd.zip_code,
          };
        }
        return null;
      };

      const [propertyAddress1, propertyAddress2] = await Promise.all([
        fetchPropertyDetails(v1Quotation?.lead?.property_detail_id || v1Row.property_detail_id),
        fetchPropertyDetails(v2Quotation?.lead?.property_detail_id || v2Row.property_detail_id),
      ]);

      // 3. Fetch comparison data for both versions
      const [data1, data2] = await Promise.all([
        quotationRepository.getVersionComparisonData(versionId1),
        quotationRepository.getVersionComparisonData(versionId2),
      ]);

      if (!data1 || !data2) {
        return { success: false, message: "Could not fetch version comparison data" };
      }

      const v1No = data1.version.quotationVersionNo;
      const v2No = data2.version.quotationVersionNo;

      // 4. Build items array using unified items structure
      const items = [];

      // 4a. Floor Plan
      if (data1.version.floorPlanName || data2.version.floorPlanName) {
        const floorPlanRow = {
          type: "floor_plan",
          name: data1.version.floorPlanName || data2.version.floorPlanName || "-",
          version1Value: data1.version.floorPlanName || "-",
          version2Value: data2.version.floorPlanName || "-",
        };
        if (showAll || floorPlanRow.version1Value !== floorPlanRow.version2Value) {
          items.push(floorPlanRow);
        }
      }

      // 4b. Facade
      if (data1.version.facadeName || data2.version.facadeName) {
        const facadeRow = {
          type: "facade",
          name: data1.version.facadeName || data2.version.facadeName || "-",
          version1Value: data1.version.facadeName || "-",
          version2Value: data2.version.facadeName || "-",
        };
        if (showAll || facadeRow.version1Value !== facadeRow.version2Value) {
          items.push(facadeRow);
        }
      }

      // 4c. Unified items comparison using quotation_version_items
      const allItemKeys = new Set();

      // Collect all unique item identifiers from both versions
      data1.items.forEach(item => {
        if (item.itemType === 'package' && item.packageId) {
          allItemKeys.add(`package_${item.packageId}`);
        } else if (item.itemType === 'item' && item.priceListItemId) {
          allItemKeys.add(`item_${item.priceListItemId}`);
        }
      });

      data2.items.forEach(item => {
        if (item.itemType === 'package' && item.packageId) {
          allItemKeys.add(`package_${item.packageId}`);
        } else if (item.itemType === 'item' && item.priceListItemId) {
          allItemKeys.add(`item_${item.priceListItemId}`);
        }
      });

      for (const itemKey of allItemKeys) {
        const [type, id] = itemKey.split('_');

        // Skip if key is malformed
        if (!type || !id || (type !== 'package' && type !== 'item')) {
          continue;
        }

        const v1Item = data1.items.find(item => {
          if (type === 'package') {
            return item.itemType === 'package' && item.packageId === id;
          } else {
            return item.itemType === 'item' && item.priceListItemId === id;
          }
        });
        const v2Item = data2.items.find(item => {
          if (type === 'package') {
            return item.itemType === 'package' && item.packageId === id;
          } else {
            return item.itemType === 'item' && item.priceListItemId === id;
          }
        });

        const refItem = v1Item || v2Item;

        // Skip if no reference item found
        if (!refItem) {
          continue;
        }

        if (type === 'package') {
          // Package comparison
          const row = {
            type: "package",
            name: refItem.packageName || "-",
            packageId: refItem.packageId,
            version1Value: v1Item ? v1Item.packageCost : null,
            version2Value: v2Item ? v2Item.packageCost : null,
          };

          if (showAll || row.version1Value !== row.version2Value) {
            items.push(row);
          }
        } else {
          // Individual item comparison
          const row = {
            type: "pricelist_item",
            name: refItem.priceListItemDescription || refItem.packageName || "-",
            priceListItemId: refItem.priceListItemId,
            priceListId: refItem.priceListId,
            priceListName: refItem.priceListName,
            itemCost: refItem.priceListItemCost,
            version1Quantity: v1Item ? v1Item.quantity : null,
            version1TotalPrice: v1Item ? v1Item.totalPrice : null,
            version1Note: v1Item ? v1Item.note : null,
            version2Quantity: v2Item ? v2Item.quantity : null,
            version2TotalPrice: v2Item ? v2Item.totalPrice : null,
            version2Note: v2Item ? v2Item.note : null,
          };

          const isDifferent =
            row.version1Quantity !== row.version2Quantity ||
            row.version1TotalPrice !== row.version2TotalPrice ||
            row.version1Note !== row.version2Note;

          if (showAll || isDifferent) {
            items.push(row);
          }
        }
      }

      return {
        success: true,
        data: {
          version1: {
            referenceNumber: v1Row.reference_number,
            propertyAddress: propertyAddress1,
            quotationVersionId: data1.version.quotationVersionId,
            quotationVersionNo: data1.version.quotationVersionNo,
            totalPackageCost: data1.version.totalPackageCost,
            totalPricelistCost: data1.version.totalPricelistCost,
            grandTotal: data1.version.grandTotal,
          },
          version2: {
            referenceNumber: v2Row.reference_number,
            propertyAddress: propertyAddress2,
            quotationVersionId: data2.version.quotationVersionId,
            quotationVersionNo: data2.version.quotationVersionNo,
            totalPackageCost: data2.version.totalPackageCost,
            totalPricelistCost: data2.version.totalPricelistCost,
            grandTotal: data2.version.grandTotal,
          },
          items,
        },
        message: "Quotation versions compared successfully",
      };
    } catch (error) {
      console.error("DEBUG: Error in compareQuotationVersions service:", error);
      return {
        success: false,
        message: error.message,
      };
    }
  }
  async removePackageFromVersion(versionId, packageId, builderId, companyId, userId) {
    try {
      const { QuotationVersion, Quotation, Leads } = db.sequelize?.models || db;

      // Verify the version belongs to a lead the user can access
      const sourceVersion = await QuotationVersion.findOne({
        where: { quotation_version_id: versionId },
        include: [{
          model: Quotation,
          as: "quotation",
          include: [{
            model: Leads,
            as: "lead",
            where: {
              [Op.or]: [
                { builder_id: builderId },
                ...(companyId ? [{ company_id: companyId }] : []),
              ],
            },
          }],
        }],
      });

      if (!sourceVersion) {
        return { success: false, message: "Quotation version not found or unauthorized" };
      }

      const existingVersion = sourceVersion;

      if (!existingVersion.package_id || existingVersion.package_id !== packageId) {
        return {
          success: false,
          message: "Package ID does not exist in this quotation version",
        };
      }

      if (existingVersion.is_approve === true) {
        return {
          success: false,
          message: "This quotation version is already approved and cannot be modified",
        };
      }

      const currentMaxVersion = await quotationRepository.getLatestQuotationVersionNo(existingVersion.quotation_id);
      if (existingVersion.quotation_version_no !== currentMaxVersion) {
        return {
          success: false,
          message: "Only the latest quotation version can be modified",
        };
      }

      const updated = await quotationRepository.removePackageFromVersion(versionId, packageId, builderId, companyId);

      // Log Activity
      await logActivity(null, {
        userId,
        builderId,
        companyId,
        referenceId: sourceVersion.quotation?.leads_id,
        referenceType: "LEAD",
        module: "Quotation",
        moduleId: versionId,
        recordName: sourceVersion.quotation?.reference_number,
        action: "UPDATE",
        description: "Package removed from quotation version",
      });

      return {
        success: true,
        data: updated,
        message: "Package removed from quotation version successfully",
      };
    } catch (error) {
      console.error("DEBUG: Error in removePackageFromVersion service:", error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async uploadStructureEngineerReport(versionId, reportUrl, builderId, companyId, userId, options = {}) {
    try {
      const { QuotationVersion, Quotation, Leads } = db.sequelize?.models || db;
      const { isExternal = false } = options;

      // External token-authenticated callers (e.g. structural engineers
      // uploading via the emailed link) have no user/builder context, so the
      // request is already authorized upstream by validateExternalToken and we
      // skip the ownership filter on the lead.
      const leadInclude = { model: Leads, as: "lead" };
      if (!isExternal) {
        const orClauses = [];
        if (builderId) orClauses.push({ builder_id: builderId });
        if (companyId) orClauses.push({ company_id: companyId });
        if (orClauses.length > 0) {
          leadInclude.where = { [Op.or]: orClauses };
        }
      }

      // 1. Fetch version and verify ownership (skipped for external requests)
      const existingVersion = await QuotationVersion.findOne({
        where: { quotation_version_id: versionId },
        include: [{
          model: Quotation,
          as: "quotation",
          include: [leadInclude],
        }],
      });

      if (!existingVersion) {
        return { success: false, message: "Quotation version not found or unauthorized" };
      }

      // Check lock status
      await checkLeadLockStatus(existingVersion.quotation?.leads_id);

      // The DriveFile (sub_reference_type=StructureEngineerReport) was upserted
      // by the controller before this service runs. Mark the report as received
      // so is_uploaded=true; it is reset to false when the engineer email is sent.
      await QuotationVersion.update(
        { is_uploaded: true },
        { where: { quotation_version_id: versionId } },
      );

      // Log activity
      await logActivity(null, {
        userId,
        builderId,
        companyId,
        referenceId: existingVersion.quotation?.leads_id,
        referenceType: "LEAD",
        module: "Quotation",
        moduleId: versionId,
        recordName: existingVersion.quotation?.reference_number,
        action: "UPDATE",
        description: "Structure engineer report PDF uploaded to quotation version",
      });

      return {
        success: true,
        data: {
          quotation_version_id: versionId,
          structure_engineer_report: reportUrl,
        },
        message: "Structure engineer report PDF uploaded successfully",
      };
    } catch (error) {
      console.error("Error in uploadStructureEngineerReport service:", error);
      return { success: false, message: error.message };
    }
  }

  // Called by PUT /version/:id/structure-engineer-report.
  // The DriveFile upsert is done by the controller before this runs, so the
  // only work here is to keep is_uploaded=true and log the replacement event.
  async updateStructureEngineerReport(versionId, reportUrl, builderId, companyId, userId, options = {}) {
    try {
      const { QuotationVersion, Quotation, Leads } = db.sequelize?.models || db;
      const { isExternal = false } = options;

      const leadInclude = { model: Leads, as: "lead" };
      if (!isExternal) {
        const orClauses = [];
        if (builderId) orClauses.push({ builder_id: builderId });
        if (companyId) orClauses.push({ company_id: companyId });
        if (orClauses.length > 0) {
          leadInclude.where = { [Op.or]: orClauses };
        }
      }

      const existingVersion = await QuotationVersion.findOne({
        where: { quotation_version_id: versionId },
        include: [{
          model: Quotation,
          as: "quotation",
          include: [leadInclude],
        }],
      });

      if (!existingVersion) {
        return { success: false, message: "Quotation version not found or unauthorized" };
      }

      // Verify a DriveFile record exists (meaning a report was previously submitted).
      const { DriveFile } = db.sequelize?.models || db;
      const existingReport = await DriveFile.findOne({
        where: {
          reference_id: versionId,
          reference_type: "QuotationVersion",
          sub_reference_type: "StructureEngineerReport",
        },
      });
      if (!existingReport) {
        return {
          success: false,
          message: "No existing structure engineer report found. Please upload a report first.",
        };
      }

      await checkLeadLockStatus(existingVersion.quotation?.leads_id);

      // Keep is_uploaded=true on replacement; it is reset to false when the
      // engineer email is (re)sent.
      await QuotationVersion.update(
        { is_uploaded: true },
        { where: { quotation_version_id: versionId } },
      );

      // Log the replacement event.
      await logActivity(null, {
        userId,
        builderId,
        companyId,
        referenceId: existingVersion.quotation?.leads_id,
        referenceType: "LEAD",
        module: "Quotation",
        moduleId: versionId,
        recordName: existingVersion.quotation?.reference_number,
        action: "UPDATE",
        description: "Structure engineer report PDF updated/replaced on quotation version",
      });

      return {
        success: true,
        data: {
          quotation_version_id: versionId,
          structure_engineer_report: reportUrl,
        },
        message: "Structure engineer report PDF updated successfully",
      };
    } catch (error) {
      console.error("Error in updateStructureEngineerReport service:", error);
      return { success: false, message: error.message };
    }
  }

  async getPublicDetailsByVersionId(versionId) {
    // Query path: QuotationVersion -> Quotation -> Leads -> [Builder, PropertyDetail]
    const version = await db.QuotationVersion.findOne({
      where: { quotation_version_id: versionId },
      attributes: ["quotation_version_id", "is_uploaded"],
      include: [
        {
          model: db.Quotation,
          as: "quotation",
          required: true,
          include: [
            {
              model: db.Leads,
              as: "lead",
              required: true,
              include: [
                { model: db.Builder, as: "builder", attributes: ["name"] },
                { model: db.PropertyDetail, attributes: ["lot_number", "street", "city", "zip_code", "estate_name", "address_line1", "address_line2"], as: "propertyDetail" },
              ],
            },
          ],
        },
      ],
    });

    if (!version) {
      const error = new Error("Quotation version not found");
      error.status = 404;
      throw error;
    }

    // Resolve the latest report file URL via DriveFile (the file row is kept
    // even after sending, so it cannot be used to derive is_uploaded).
    const { DriveFile } = db.sequelize.models;
    const reportFile = await DriveFile.findOne({
      where: {
        reference_id: versionId,
        reference_type: "QuotationVersion",
        sub_reference_type: "StructureEngineerReport",
      },
      attributes: ["s3_key"],
    });

    const s3Key = reportFile?.s3_key || null;
    const { env } = await import("../../config/env.config.js");
    const structureEngineerReport = s3Key
      ? `https://${env.AWS.S3_BUCKET_NAME}.s3.${env.AWS.AWS_REGION}.amazonaws.com/${s3Key}`
      : null;

    const lead = version.quotation?.lead;
    return {
      success: true,
      data: {
        builder_name: lead?.builder?.name || null,
        property_details: lead?.propertyDetail || null,
        structure_engineer_report: structureEngineerReport,
        is_uploaded: version.is_uploaded,
      },
      message: "Public quotation version details retrieved successfully",
    };
  }
}

export default new QuotationService();
