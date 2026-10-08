import * as supplierDocumentService from "./supplier-document.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

export async function createSupplierDocument(req, res) {
  try {
    const result = await supplierDocumentService.createSupplierDocument(req.user, req.body, req.files);
    return successResponse(res, result, "Supplier documents created successfully.");
  } catch (error) {
    console.error("Create Supplier Document Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export async function getAllSupplierDocuments(req, res) {
  try {
    const result = await supplierDocumentService.getAllSupplierDocuments(req.user, req.query);
    return successResponse(res, result, "Supplier documents fetched successfully.");
  } catch (error) {
    console.error("Get All Supplier Documents Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export async function updateSupplierDocument(req, res) {
  try {
    const { id } = req.params;
    const result = await supplierDocumentService.updateSupplierDocument(req.user, id, req.body, req.files);
    return successResponse(res, result, "Supplier documents updated successfully.");
  } catch (error) {
    console.error("Update Supplier Document Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}
