import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getQuotationSettingService,
  updateQuotationSettingsService,
} from "./quotation-setting.service.js";

export async function getQuotationSetting(req, res) {
  const { company_id, builder_id, user_id } = req.user;

  try {
    if (!company_id || !builder_id) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    const result = await getQuotationSettingService({ company_id, builder_id, user_id });

    return successResponse(
      res,
      { quotationSettings: keysToCamelCase(result) },
      "Quotation Settings fetched successfully",
    );
  } catch (error) {
    console.error("Error fetching quotation settings:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updateQuotationSettings(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;
  const userId = req.user?.user_id;
  const { quotation_settings_id } = req.params;

  const {
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
  } = req.body;

  try {
    if (!quotation_settings_id) {
      return errorResponse(res, 400, "quotation_settings_id is required.");
    }

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: Missing builder or company ID.");
    }

    const hasAtLeastOneField = Object.values(req.body).some((v) => v !== undefined);
    if (!hasAtLeastOneField) {
      return errorResponse(res, 400, "At least one field is required to update.");
    }

    const result = await updateQuotationSettingsService({
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
    });

    return successResponse(res, keysToCamelCase(result), "Quotation settings updated successfully.");
  } catch (error) {
    console.error("Error updating quotation settings:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
