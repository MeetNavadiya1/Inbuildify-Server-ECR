import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import {
  getTemplateEmailSignatureService,
  updateTemplateEmailSignatureService,
} from "./template-email-signature.service.js";

export async function getTemplateEmailSignature(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    const { signature, created } = await getTemplateEmailSignatureService({
      builderId,
      companyId,
      userId,
    });

    return successResponse(
      res,
      {
        includeEmailSignature: signature.includeEmailSignature,
        signatureContent: signature.signatureContent,
      },
      created
        ? "Default template email signature created."
        : "Template email signature retrieved successfully.",
    );
  } catch (error) {
    console.error("Error fetching template email signature:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function updateTemplateEmailSignature(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    const result = await updateTemplateEmailSignatureService({
      builderId,
      companyId,
      userId,
      payload: req.body,
    });

    return successResponse(
      res,
      result,
      "Template email signature updated successfully.",
    );
  } catch (error) {
    console.error("Error updating template email signature:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}
