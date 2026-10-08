import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  createSupplierContactService,
  getAllSupplierContactsService,
  deleteSupplierContactService,
  updateSupplierContactService,
} from "./supplier-contact.service.js";

export async function createSupplierContact(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const result = await createSupplierContactService(req.body, builderId);

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(
      res,
      result.data,
      "Supplier contact created successfully.",
    );
  } catch (error) {
    console.error("Error creating supplier contact:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getAllSupplierContacts(req, res) {
  try {
    const builderId = req.user?.builder_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Missing builder ID.");
    }

    const { supplier_id } = req.query;
    const result = await getAllSupplierContactsService(builderId, supplier_id);

    return successResponse(
      res,
      result.data,
      "Supplier contacts fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching supplier contacts:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function deleteSupplierContact(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const { supplier_contact_id } = req.params;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Missing builder ID.");
    }

    const result = await deleteSupplierContactService(
      supplier_contact_id,
      builderId,
    );

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, {}, "Supplier contact deleted successfully.");
  } catch (error) {
    console.error("Error deleting supplier contact:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updateSupplierContact(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const { supplier_contact_id } = req.params;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Missing builder ID.");
    }

    if (!supplier_contact_id) {
      return errorResponse(res, 400, "supplier_contact_id is required.");
    }

    const result = await updateSupplierContactService(
      supplier_contact_id,
      req.body,
      builderId,
    );

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(
      res,
      result.data,
      "Supplier contact updated successfully.",
    );
  } catch (error) {
    console.error("Error updating supplier contact:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

