import { errorResponse, successResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createEtsRechargeApprovalService,
  getAllEtsRechargeApprovalsService,
  getEtsRechargeApprovalByIdService,
  updateEtsRechargeApprovalService,
  deleteEtsRechargeApprovalService,
} from "./construction-ets-recharge-approval.service.js";

export async function createConstructionEtsRechargeApproval(req, res) {
  try {
    const user = req.user;
    const item = await createEtsRechargeApprovalService(user, req.body);
    return successResponse(res, keysToCamelCase(item), "Construction ETS recharge approval created successfully.");
  } catch (error) {
    console.error("Create Construction ETS Recharge Approval Error:", error);
    return errorResponse(res, 400, error.message || "Internal server error.");
  }
}

export async function getAllConstructionEtsRechargeApprovals(req, res) {
  try {
    const data = await getAllEtsRechargeApprovalsService(req.query);
    return successResponse(res, keysToCamelCase(data), "Construction ETS recharge approvals fetched successfully.");
  } catch (error) {
    console.error("Get All Construction ETS Recharge Approvals Error:", error);
    return errorResponse(res, 400, error.message || "Internal server error.");
  }
}

export async function getConstructionEtsRechargeApprovalById(req, res) {
  try {
    const { construction_ets_recharge_approval_id } = req.params;
    const data = await getEtsRechargeApprovalByIdService(construction_ets_recharge_approval_id);
    return successResponse(res, keysToCamelCase(data), "Construction ETS recharge approval fetched successfully.");
  } catch (error) {
    console.error("Get Construction ETS Recharge Approval By ID Error:", error);
    return errorResponse(res, 400, error.message || "Internal server error.");
  }
}

export async function updateConstructionEtsRechargeApproval(req, res) {
  try {
    const user = req.user;
    const { construction_ets_recharge_approval_id } = req.params;
    const data = await updateEtsRechargeApprovalService(user, construction_ets_recharge_approval_id, req.body);
    return successResponse(res, keysToCamelCase(data), "Construction ETS recharge approval updated successfully.");
  } catch (error) {
    console.error("Update Construction ETS Recharge Approval Error:", error);
    return errorResponse(res, 400, error.message || "Internal server error.");
  }
}

export async function deleteConstructionEtsRechargeApproval(req, res) {
  try {
    const { construction_ets_recharge_approval_id } = req.params;
    await deleteEtsRechargeApprovalService(construction_ets_recharge_approval_id);
    return successResponse(res, {}, "Construction ETS recharge approval deleted successfully.");
  } catch (error) {
    console.error("Delete Construction ETS Recharge Approval Error:", error);
    return errorResponse(res, 400, error.message || "Internal server error.");
  }
}
