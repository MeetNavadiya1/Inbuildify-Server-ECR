import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  getEstateDocumentsService,
  getEstateImagesService,
  updateEstateImageService,
  createEstateDocumentService,
  updateEstateDocumentService,
} from "./estate-document-image.service.js";

/* -----------------------------
   ESTATE IMAGES
------------------------------ */

export async function getEstateImages(req, res) {
  try {
    const userId = req.user?.users_id;
    const companyId = req.user?.company_id;
    const builderId = req.user?.builder_id;

    const data = await getEstateImagesService({
      builderId,
      companyId,
      userId,
      query: req.query,
    });

    return successResponse(
      res,
      data,
      "Estate images fetched successfully",
    );
  } catch (error) {
    console.error("Error fetching estate images:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function updateEstateImage(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user?.users_id;
    const companyId = req.user?.company_id;
    const builderId = req.user?.builder_id;

    const data = await updateEstateImageService({
      id,
      builderId,
      companyId,
      userId,
      data: req.body,
    });

    return successResponse(
      res,
      data,
      "Estate image updated successfully",
    );
  } catch (error) {
    console.error("Error updating estate image:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}

export async function createEstateDocument(req, res) {
  try {
    const userId = req.user?.users_id;
    const companyId = req.user?.company_id;
    const builderId = req.user?.builder_id;

    const data = await createEstateDocumentService({
      builderId,
      companyId,
      userId,
      data: req.body,
    });

    return successResponse(
      res,
      data,
      "Estate document created successfully",
    );
  } catch (error) {
    console.error("Error creating estate document:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}

/* -----------------------------
   ESTATE DOCUMENTS
------------------------------ */

export async function getEstateDocuments(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const data = await getEstateDocumentsService({
      builderId,
      companyId,
      query: req.query,
    });

    return successResponse(
      res,
      data,
      "Estate documents fetched successfully",
    );
  } catch (error) {
    console.error("Error fetching estate documents:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}
export async function updateEstateDocument(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user?.users_id;
    const companyId = req.user?.company_id;
    const builderId = req.user?.builder_id;

    const result = await updateEstateDocumentService({
      id,
      builderId,
      companyId,
      userId,
      data: req.body,
    });

    return successResponse(
      res,
      result,
      "Estate document updated successfully",
    );
  } catch (error) {
    console.error("Error updating estate document:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}
