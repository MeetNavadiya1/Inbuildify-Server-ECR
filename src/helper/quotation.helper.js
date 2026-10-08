import { Op } from "sequelize";

import db from "../config/database/models/postgre-models/index.js";
import { deleteQuotationDriveFile } from "./quotationDriveFile.helper.js";
import { DRIVE_FILE_MAPPING } from "../constants/driveFile.js";

/** The one line item the compaction report status owns. Matched by description. */
export const COMPACTION_REPORT_CHARGE = "Compaction Report Charge";

/**
 * Synchronizes the "Compaction Report Charge" across all non-approved quotation versions
 * of a lead based on the property's compaction report status.
 *
 * The charge is owed in exactly one case: the report is "not_available" AND the
 * builder is the one supplying it. Every other combination — the report was
 * provided, or the customer supplies it themselves ("self") — means no charge,
 * so this both adds and removes. It is idempotent: call it after anything that
 * can change either side (the property's compaction fields, a new version, a
 * range/dwelling wipe) and the quotations end up matching the property.
 *
 * @param {string} leadsId - The UUID of the lead.
 * @param {string} builderId - The UUID of the builder.
 * @param {string} companyId - The UUID of the company.
 * @param {string} userId - The UUID of the user performing the action.
 * @param {object} [transaction] - Optional Sequelize transaction.
 */
export const syncCompactionReportCharge = async (leadsId, builderId, companyId, userId, transaction) => {
  try {
    const { Leads, PropertyDetail, Quotation, QuotationVersion, PriceList, PriceListItem, QuotationVersionItem } = db;

    // 1. Get lead and property detail
    const lead = await Leads.findOne({
      where: { leads_id: leadsId },
      include: [
        {
          model: PropertyDetail,
          as: "propertyDetail",
          attributes: ["compaction_report", "compaction_report_provider"],
        },
      ],
      transaction,
    });

    if (!lead || !lead.propertyDetail) return;
    const { compaction_report: status, compaction_report_provider: provider } = lead.propertyDetail;

    // 2. Get all non-approved quotation versions for this lead.
    //
    // Seeded versions are excluded rather than filtered afterwards. A demo lead
    // carries imported quotations alongside any the builder adds themselves, and
    // this runs across the whole lead — so creating a quotation on a demo lead
    // was quietly dropping a "Compaction Report Charge" line onto every demo
    // version too, unflagged and fully editable, which is exactly the demo
    // content the sample data is supposed to hold still. The removal branch
    // below is worse: its bulk destroy would hit the seeded rows, and the
    // read-only guard refuses those, taking the whole property save down with
    // it.
    const versions = await QuotationVersion.findAll({
      where: { is_approve: false, is_sample_data: { [Op.not]: true } },
      include: [
        {
          model: Quotation,
          as: "quotation",
          where: { leads_id: leadsId },
          attributes: [],
        },
      ],
      transaction,
    });

    // Nothing real to sync — return before the findOrCreate below, so a lead
    // whose only quotations are demo ones does not conjure a price list either.
    if (versions.length === 0) return;

    const versionIds = versions.map((v) => v.quotation_version_id);
    // Versions whose item list actually changed. Their cached quotation PDF is
    // now stale — it prints a grand total that no longer matches the items —
    // so it is dropped at the end and regenerated on next request.
    const changedVersionIds = [];

    if (status === "not_available" && provider === "builder") {
      // 3. Find or create "Base Price" PriceList
      const [priceList] = await PriceList.findOrCreate({
        where: { 
          builder_id: builderId, 
          name: "Base Price" 
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

      // 4. Find or create "Compaction Report Charge" PriceListItem
      const [pliRecord] = await PriceListItem.findOrCreate({
        where: {
          price_list_id: priceList.price_list_id,
          item_description: COMPACTION_REPORT_CHARGE,
        },
        defaults: {
          price_list_id: priceList.price_list_id,
          company_id: companyId || null,
          builder_id: builderId,
          item_description: COMPACTION_REPORT_CHARGE,
          cost_type: "Fixed",
          cost: 250.00,
          builder_cost: 100.00,
          status: "active",
          created_by: userId || null,
          is_system_data: true,
        },
        transaction,
      });

      const pli = pliRecord.get({ plain: true });

      // 5. Sync item across all non-approved versions
      for (const version of versions) {
        const [, created] = await QuotationVersionItem.findOrCreate({
          where: {
            quotation_version_id: version.quotation_version_id,
            price_list_item_description: COMPACTION_REPORT_CHARGE,
          },
          defaults: {
            quotation_version_id: version.quotation_version_id,
            price_list_id: pli.price_list_id,
            price_list_name: priceList.name,
            price_list_item_id: pli.price_list_item_id,
            price_list_item_description: pli.item_description,
            price_list_item_short_description: pli.short_description,
            price_list_item_cost_type: pli.cost_type,
            price_list_item_cost_type_text: pli.cost_type_text,
            price_list_item_cost_option: pli.cost_option,
            price_list_item_cost: pli.cost,
            price_list_item_builder_cost: pli.builder_cost,
            price_list_item_sort_order: pli.sort_order,
            price_list_item_uom: pli.uom,
            price_list_item_status: pli.status,
            price_list_item_include_by_default: pli.include_by_default,
            price_list_item_allow_remove_from_quotation: pli.allow_remove_from_quotation,
            price_list_item_show_in_hl_package: pli.show_in_hl_package,
            price_list_item_package_only: pli.show_only_in_package,
            price_list_item_range_id: pli.range_id,
            price_list_item_dwelling_type_id: pli.dwelling_type_id,
            price_list_item_is_system_data: pli.is_system_data,
            price_list_item_created_at: pli.createdAt,
            price_list_item_updated_at: pli.updatedAt,
            quantity: 1,
            total_price: pli.cost,
          },
          transaction,
        });

        if (created) changedVersionIds.push(version.quotation_version_id);
      }
    } else {
      // 6. Remove the charge — it is no longer applicable.
      //
      // This is every remaining combination, not just status === "available".
      // Switching the provider from "builder" to "self" while the report is
      // still not_available also ends the charge: the customer is supplying the
      // report, so the builder has nothing to bill for. That case used to fall
      // through both branches, leaving the line (and its $250) on the quotation
      // with no way for the user to take it off — the UI blocks deleting a
      // system item by hand.
      //
      // Read the affected versions first: destroy() returns a row count, not
      // which versions it hit, and only those versions need their PDF dropped.
      const staleItems = await QuotationVersionItem.findAll({
        where: {
          quotation_version_id: versionIds,
          price_list_item_description: COMPACTION_REPORT_CHARGE,
        },
        attributes: ["quotation_version_id"],
        transaction,
      });

      if (staleItems.length > 0) {
        await QuotationVersionItem.destroy({
          where: {
            quotation_version_id: versionIds,
            price_list_item_description: COMPACTION_REPORT_CHARGE,
          },
          transaction,
        });
        changedVersionIds.push(...staleItems.map((i) => i.quotation_version_id));
      }
    }

    // 7. Invalidate the cached quotation PDF of every version that changed.
    for (const versionId of new Set(changedVersionIds)) {
      await deleteQuotationDriveFile(
        versionId,
        DRIVE_FILE_MAPPING.SUB_REFERENCES.QUOTATION_REPORT,
        { transaction },
      );
    }
  } catch (error) {
    console.error("Error in syncCompactionReportCharge helper:", error);
    throw error;
  }
};

/**
 * Checks if a quotation is locked (i.e., any of its versions are approved).
 * 
 * @param {string} [quotationId] - The UUID of the quotation.
 * @param {string} [versionId] - The UUID of a quotation version.
 * @param {object} [transaction] - Optional Sequelize transaction.
 * @throws {Error} If the quotation is locked.
 */
export const checkQuotationLockStatus = async (quotationId, versionId, transaction = null) => {
  const { QuotationVersion } = db;
  let qId = quotationId;

  if (!qId && versionId) {
    const version = await QuotationVersion.findByPk(versionId, {
      attributes: ["quotation_id"],
      transaction
    });
    if (version) {
      qId = version.quotation_id;
    }
  }

  if (!qId) return;

  const approvedVersion = await QuotationVersion.findOne({
    where: {
      quotation_id: qId,
      is_approve: true,
    },
    attributes: ["quotation_version_id"],
    transaction
  });

  if (approvedVersion) {
    const error = new Error("This action cannot be performed because a version of this quotation has already been approved.");
    error.status = 400;
    throw error;
  }
};

/**
 * Checks if a lead's property details are locked (i.e., any associated quotation is approved).
 * 
 * @param {string} leadsId - The UUID of the lead.
 * @param {object} [transaction] - Optional Sequelize transaction.
 * @throws {Error} If the lead is locked.
 */
export const checkLeadQuotationLockStatus = async (leadsId, transaction = null) => {
  if (!leadsId) return;

  const { QuotationVersion, Quotation } = db;

  const approvedVersion = await QuotationVersion.findOne({
    include: [
      {
        model: Quotation,
        as: "quotation",
        where: { leads_id: leadsId },
        attributes: [],
      },
    ],
    where: {
      is_approve: true,
    },
    attributes: ["quotation_version_id"],
    transaction
  });

  if (approvedVersion) {
    const error = new Error("This action cannot be performed because an associated quotation has already been approved.");
    error.status = 400;
    throw error;
  }
};
