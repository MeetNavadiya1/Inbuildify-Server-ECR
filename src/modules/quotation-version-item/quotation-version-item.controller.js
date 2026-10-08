import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import quotationVersionItemService from "./quotation-version-item.service.js";

// Add individual item snapshot
export async function addQuotationItem(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    const result = await quotationVersionItemService.addQuotationItem(
      req.body,
      builderId,
      companyId
    );

    if (result.success) {
      return successResponse(res, result.data, 201, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    console.error("Add quotation item error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

// Add package snapshot
export async function addQuotationPackage(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    const result = await quotationVersionItemService.addQuotationPackage({
      ...req.body,
      builderId,
      companyId,
      userId: req.user?.users_id,
    });

    if (result.success) {
      return successResponse(res, result.data, 201, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    console.error("Add quotation package error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

// Update package snapshot (Replace existing package)
export async function updateQuotationPackage(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    const result = await quotationVersionItemService.updateQuotationPackage({
      ...req.body,
      builderId,
      companyId,
      userId: req.user?.users_id,
    });

    if (result.success) {
      return successResponse(res, result.data, 200, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    console.error("Update quotation package error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

// Get all items for a version
export async function getQuotationVersionItems(req, res) {
  try {
    const { quotation_version_id } = req.params;
    const { range_id, dwelling_type_id, package_id } = req.query;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await quotationVersionItemService.getQuotationVersionItems(
      quotation_version_id,
      { range_id, dwelling_type_id, package_id },
      builderId,
      companyId,
    );

    if (result.success) {
      return successResponse(res, result.data, 200, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    console.error("Get quotation version items error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

// Update item snapshot
export async function updateQuotationVersionItem(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await quotationVersionItemService.updateQuotationVersionItem(
      id,
      req.body,
      builderId,
      companyId,
    );

    if (result.success) {
      return successResponse(res, result.data, 200, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    console.error("Update quotation version item error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

// Delete item
export async function deleteQuotationVersionItem(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await quotationVersionItemService.deleteQuotationVersionItem(
      id,
      builderId,
      companyId,
    );

    if (result.success) {
      return successResponse(res, null, 200, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    console.error("Delete quotation version item error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

// Delete package
export async function removePackageFromVersion(req, res) {
  try {
    const { quotation_version_id, package_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await quotationVersionItemService.removePackageFromVersion(
      quotation_version_id,
      package_id,
      builderId,
      companyId,
      req.user?.users_id,
    );

    if (result.success) {
      return successResponse(res, null, 200, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    console.error("Delete package from version error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function addExtraQuotationItem(req, res) {
  try {
    const { quotation_version_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await quotationVersionItemService.addExtraQuotationItemService(
      quotation_version_id,
      req.body,
      builderId,
      companyId,
    );

    if (result.success) {
      return successResponse(res, result.data, 201, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    console.error("Add extra quotation item error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function updateExtraQuotationItem(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await quotationVersionItemService.updateExtraQuotationItemService(
      id,
      req.body,
      builderId,
      companyId,
    );

    if (result.success) {
      return successResponse(res, result.data, 200, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    console.error("Update extra quotation item error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export default {
  addQuotationItem,
  addQuotationPackage,
  updateQuotationPackage,
  getQuotationVersionItems,
  updateQuotationVersionItem,
  deleteQuotationVersionItem,
  removePackageFromVersion,
  addExtraQuotationItem,
  updateExtraQuotationItem,
};
