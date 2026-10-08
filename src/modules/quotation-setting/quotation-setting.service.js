import db from "../../config/database/models/postgre-models/index.js";
//not used at anywhere
export async function createQuotationSettingsService({
  builderId,
  companyId,
  userId,
  allow_save_as_new_version,
  mandatory_contact_details,
  mandatory_dwelling_type,
  mandatory_sketch_number,
  mandatory_land_title,
  enable_dwelling_size,
  enable_builder_cost,
  allow_notes,
  allow_cost_adjustment,
  show_notes_by_default,
  allow_multiple_packages,
  include_additional_items_in_price_adjusted_list,
  auto_approve_on_sales_won,
  show_default_pricelist_in_additional_items,
  hide_price_to_customer,
  enable_estimated_price_range,
  quotation_validity_days,
  extend_validity_from_updated_date,
  rename_send_for_approval_button,
  default_pricelist_id,
}) {
  const transaction = await db.sequelize.transaction();

  try {
    // ── 1. Check duplicate settings for this builder/company ─────────────────
    const existing = await db.QuotationSettings.findOne({
      where: {
        [db.Sequelize.Op.or]: [
          { builder_id: builderId },
          { company_id: companyId },
        ],
      },
      attributes: ["quotation_settings_id"],
      transaction,
    });

    if (existing) {
      const error = new Error("Quotation settings already exist for this builder/company.");
      error.status = 400;
      throw error;
    }

    // ── 2. Validate default_pricelist_id exists and is active ────────────────
    if (default_pricelist_id) {
      const priceList = await db.PriceList.findOne({
        where: {
          price_list_id: default_pricelist_id,
          builder_id: builderId,
          company_id: companyId,
        },
        attributes: ["price_list_id", "is_active"],
        transaction,
      });

      if (!priceList) {
        const error = new Error("Invalid default_pricelist_id. Price list not found.");
        error.status = 400;
        throw error;
      }

      if (!priceList.is_active) {
        const error = new Error("Inactive price list.");
        error.status = 400;
        throw error;
      }
    }

    // ── 3. Insert quotation settings ─────────────────────────────────────────
    const newSettings = await db.QuotationSettings.create(
      {
        company_id: companyId,
        builder_id: builderId,
        allow_save_as_new_version: allow_save_as_new_version ?? false,
        mandatory_contact_details: mandatory_contact_details ?? false,
        mandatory_dwelling_type: mandatory_dwelling_type ?? false,
        mandatory_sketch_number: mandatory_sketch_number ?? false,
        mandatory_land_title: mandatory_land_title ?? false,
        enable_dwelling_size: enable_dwelling_size ?? false,
        enable_builder_cost: enable_builder_cost ?? false,
        allow_notes: allow_notes ?? true,
        allow_cost_adjustment: allow_cost_adjustment ?? true,
        show_notes_by_default: show_notes_by_default ?? true,
        allow_multiple_packages: allow_multiple_packages ?? false,
        include_additional_items_in_price_adjusted_list: include_additional_items_in_price_adjusted_list ?? false,
        auto_approve_on_sales_won: auto_approve_on_sales_won ?? false,
        show_default_pricelist_in_additional_items: show_default_pricelist_in_additional_items ?? true,
        hide_price_to_customer: hide_price_to_customer ?? false,
        enable_estimated_price_range: enable_estimated_price_range ?? false,
        quotation_validity_days: quotation_validity_days ?? 30,
        extend_validity_from_updated_date: extend_validity_from_updated_date ?? 0,
        rename_send_for_approval_button: rename_send_for_approval_button ?? null,
        default_pricelist_id: default_pricelist_id ?? null,
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    await transaction.commit();

    return newSettings.toJSON();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getQuotationSettingService({ company_id, builder_id, user_id }) {
  // ── 1. Find existing quotation settings ──────────────────────────────────
  const existing = await db.QuotationSettings.findOne({
    where: {
      company_id,
      builder_id,
    },
    order: [["created_at", "DESC"]],
  });

  if (existing) {
    return existing.toJSON();
  }

  // ── 2. Auto-create with defaults if not found ────────────────────────────
  const created = await db.QuotationSettings.create({
    company_id,
    builder_id,
    created_by: user_id,
    updated_by: user_id,
  });

  return created.toJSON();
}

export async function updateQuotationSettingsService({
  quotation_settings_id,
  builderId,
  companyId,
  userId,
  allow_save_as_new_version,
  mandatory_contact_details,
  mandatory_dwelling_type,
  mandatory_sketch_number,
  mandatory_land_title,
  enable_dwelling_size,
  enable_builder_cost,
  allow_notes,
  allow_cost_adjustment,
  show_notes_by_default,
  allow_multiple_packages,
  include_additional_items_in_price_adjusted_list,
  auto_approve_on_sales_won,
  show_default_pricelist_in_additional_items,
  hide_price_to_customer,
  enable_estimated_price_range,
  quotation_validity_days,
  extend_validity_from_updated_date,
  rename_send_for_approval_button,
  default_pricelist_id,
}) {
  const transaction = await db.sequelize.transaction();

  try {
    // ── 1. Check record exists and belongs to builder or company ─────────────
    const existing = await db.QuotationSettings.findOne({
      where: {
        quotation_settings_id,
        [db.Sequelize.Op.or]: [
          { builder_id: builderId },
          { company_id: companyId },
        ],
      },
      transaction,
    });

    if (!existing) {
      const error = new Error("Quotation settings not found or access denied.");
      error.status = 404;
      throw error;
    }

    // ── 2. Validate default_pricelist_id if provided ─────────────────────────
    if (default_pricelist_id !== undefined && default_pricelist_id !== null) {
      const priceList = await db.PriceList.findOne({
        where: {
          price_list_id: default_pricelist_id,
          builder_id: builderId,
          company_id: companyId,
        },
        attributes: ["price_list_id", "is_active"],
        transaction,
      });

      if (!priceList) {
        const error = new Error("Invalid default_pricelist_id.");
        error.status = 400;
        throw error;
      }

      if (!priceList.is_active) {
        const error = new Error("Inactive default price list.");
        error.status = 400;
        throw error;
      }
    }

    // ── 3. Update — fall back to existing values for fields not provided ──────
    const old = existing.toJSON();

    await existing.update(
      {
        allow_save_as_new_version: allow_save_as_new_version ?? old.allow_save_as_new_version,
        mandatory_contact_details: mandatory_contact_details ?? old.mandatory_contact_details,
        mandatory_dwelling_type: mandatory_dwelling_type ?? old.mandatory_dwelling_type,
        mandatory_sketch_number: mandatory_sketch_number ?? old.mandatory_sketch_number,
        mandatory_land_title: mandatory_land_title ?? old.mandatory_land_title,
        enable_dwelling_size: enable_dwelling_size ?? old.enable_dwelling_size,
        enable_builder_cost: enable_builder_cost ?? old.enable_builder_cost,
        allow_notes: allow_notes ?? old.allow_notes,
        allow_cost_adjustment: allow_cost_adjustment ?? old.allow_cost_adjustment,
        show_notes_by_default: show_notes_by_default ?? old.show_notes_by_default,
        allow_multiple_packages: allow_multiple_packages ?? old.allow_multiple_packages,
        include_additional_items_in_price_adjusted_list: include_additional_items_in_price_adjusted_list ?? old.include_additional_items_in_price_adjusted_list,
        auto_approve_on_sales_won: auto_approve_on_sales_won ?? old.auto_approve_on_sales_won,
        show_default_pricelist_in_additional_items: show_default_pricelist_in_additional_items ?? old.show_default_pricelist_in_additional_items,
        hide_price_to_customer: hide_price_to_customer ?? old.hide_price_to_customer,
        enable_estimated_price_range: enable_estimated_price_range ?? old.enable_estimated_price_range,
        quotation_validity_days: quotation_validity_days ?? old.quotation_validity_days,
        extend_validity_from_updated_date: extend_validity_from_updated_date ?? old.extend_validity_from_updated_date,
        rename_send_for_approval_button: rename_send_for_approval_button ?? old.rename_send_for_approval_button,
        default_pricelist_id: default_pricelist_id ?? old.default_pricelist_id,
        updated_by: userId,
      },
      { transaction },
    );

    await transaction.commit();

    return existing.toJSON();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
