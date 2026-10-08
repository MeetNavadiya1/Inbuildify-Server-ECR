import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  createSupplierService,
  getAllSuppliersService,
  getSupplierByIdService,
  updateSupplierService,
  deleteSupplierService,
} from "./supplier.service.js";

export async function createSupplier(req, res) {
  try {
    const builderId = req.user.builder_id;
    const companyId = req.user.company_id;
    const userId = req.user.user_id;

    const {
      company_name,
      abn,
      description,
      contact_name,
      primary_phone,
      secondary_phone,
      website,
      address_line1,
      city,
      state_id,
      country_id,
      zip_code,
      lead_time,
      status,
      email,
      supplier_type_id,
      contacts,
      work_cover_url,
      pl_insurance_url,
      white_card_url,
      fork_lift_license_url,
      trade_license_url,
      induction_pack_received,
      induction_pack_url,
    } = req.body || {};

    const finalWorkCoverUrl =
      req.files?.workCoverImage?.[0]?.location || work_cover_url || null;
    const finalPlInsuranceUrl =
      req.files?.plInsuranceImage?.[0]?.location || pl_insurance_url || null;
    const finalWhiteCardUrl =
      req.files?.whiteCardImage?.[0]?.location || white_card_url || null;
    const finalForkLiftLicenseUrl =
      req.files?.forkLiftLicenseImage?.[0]?.location ||
      fork_lift_license_url ||
      null;
    const finalTradeLicenseUrl =
      req.files?.tradeLicenseImage?.[0]?.location || trade_license_url || null;
    const finalInductionPackUrl =
      req.files?.inductionPackImage?.[0]?.location ||
      induction_pack_url ||
      null;

    const result = await createSupplierService(
      {
        company_name,
        abn,
        description,
        contact_name,
        primary_phone,
        secondary_phone,
        website,
        address_line1,
        city,
        state_id,
        country_id,
        zip_code,
        lead_time,
        status,
        email,
        supplier_type_id,
        contacts,
        work_cover_url: finalWorkCoverUrl,
        pl_insurance_url: finalPlInsuranceUrl,
        white_card_url: finalWhiteCardUrl,
        fork_lift_license_url: finalForkLiftLicenseUrl,
        trade_license_url: finalTradeLicenseUrl,
        induction_pack_received,
        induction_pack_url: finalInductionPackUrl,
      },
      companyId,
      builderId,
      userId,
    );

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Supplier created successfully.");
  } catch (error) {
    console.error("Error creating supplier:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getAllSuppliers(req, res) {
  try {
    const builderId = req.user.builder_id;
    const companyId = req.user.company_id;

    const {
      company_name,
      phone,
      email,
      website,
      status,
      induction,
      supplier_type_id,
    } = req.query;

    const result = await getAllSuppliersService({
      companyId,
      builderId,
      filters: {
        company_name,
        phone,
        email,
        website,
        status,
        induction,
        supplier_type_id,
      },
    });

    return successResponse(
      res,
      result.data,
      "Suppliers fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    return handleControllerError(res, error, error?.message || "Internal Server Error");
  }
}

export async function deleteSupplier(req, res) {
  try {
    const builderId = req.user.builder_id;
    const companyId = req.user.company_id;
    const { supplier_id } = req.params;

    const result = await deleteSupplierService(
      supplier_id,
      builderId,
      companyId,
    );

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(
      res,
      null,
      "Supplier and all associated records deleted successfully.",
    );
  } catch (error) {
    console.error("Error deleting supplier:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
export async function updateSupplier(req, res) {
  try {
    const { supplier_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;

    const {
      company_name,
      abn,
      description,
      contact_name,
      primary_phone,
      secondary_phone,
      website,
      address_line1,
      city,
      state_id,
      country_id,
      zip_code,
      lead_time,
      status,
      email,
      supplier_type_id,
      work_cover_url,
      pl_insurance_url,
      white_card_url,
      fork_lift_license_url,
      trade_license_url,
      induction_pack_received,
      induction_pack_url,
    } = req.body;

    const finalWorkCoverUrl =
      req.files?.workCoverImage?.[0]?.location || work_cover_url;
    const finalPlInsuranceUrl =
      req.files?.plInsuranceImage?.[0]?.location || pl_insurance_url;
    const finalWhiteCardUrl =
      req.files?.whiteCardImage?.[0]?.location || white_card_url;
    const finalForkLiftLicenseUrl =
      req.files?.forkLiftLicenseImage?.[0]?.location || fork_lift_license_url;
    const finalTradeLicenseUrl =
      req.files?.tradeLicenseImage?.[0]?.location || trade_license_url;
    const finalInductionPackUrl =
      req.files?.inductionPackImage?.[0]?.location || induction_pack_url;

    const result = await updateSupplierService(
      supplier_id,
      {
        company_name,
        abn,
        description,
        contact_name,
        primary_phone,
        secondary_phone,
        website,
        address_line1,
        city,
        state_id,
        country_id,
        zip_code,
        lead_time,
        status,
        email,
        supplier_type_id,
        work_cover_url: finalWorkCoverUrl,
        pl_insurance_url: finalPlInsuranceUrl,
        white_card_url: finalWhiteCardUrl,
        fork_lift_license_url: finalForkLiftLicenseUrl,
        trade_license_url: finalTradeLicenseUrl,
        induction_pack_received,
        induction_pack_url: finalInductionPackUrl,
      },
      builderId,
      companyId,
      userId,
    );

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(
      res,
      result.data,
      "Supplier updated successfully.",
    );
  } catch (error) {
    console.error("Error updating supplier:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export async function getSupplierById(req, res) {
  try {
    const { supplier_id } = req.params;
    const builderId = req.user.builder_id;
    const companyId = req.user.company_id;

    const result = await getSupplierByIdService(
      supplier_id,
      builderId,
      companyId,
    );

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(
      res,
      result.data,
      "Supplier fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching supplier by ID:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
