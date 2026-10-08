import express from "express";

const router = express.Router();

import {
  createConstructionEtsRechargeApproval,
  getAllConstructionEtsRechargeApprovals,
  getConstructionEtsRechargeApprovalById,
  updateConstructionEtsRechargeApproval,
  deleteConstructionEtsRechargeApproval,
} from "./construction-ets-recharge-approval.controller.js";
import {
  createConstructionEtsRechargeApprovalValidation,
  updateConstructionEtsRechargeApprovalValidation,
  getConstructionEtsRechargeApprovalByIdValidation,
  queryValidation,
} from "./construction-ets-recharge-approval.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.post(
  "/",
  validateRequest(createConstructionEtsRechargeApprovalValidation, REQUEST_SOURCE.BODY),
  createConstructionEtsRechargeApproval,
);

router.get(
  "/",
  validateRequest(queryValidation, REQUEST_SOURCE.QUERY),
  getAllConstructionEtsRechargeApprovals,
);

router.get(
  "/:construction_ets_recharge_approval_id",
  validateRequest(getConstructionEtsRechargeApprovalByIdValidation, REQUEST_SOURCE.PARAMS),
  getConstructionEtsRechargeApprovalById,
);

router.put(
  "/:construction_ets_recharge_approval_id",
  validateRequest(getConstructionEtsRechargeApprovalByIdValidation, REQUEST_SOURCE.PARAMS),
  validateRequest(updateConstructionEtsRechargeApprovalValidation, REQUEST_SOURCE.BODY),
  updateConstructionEtsRechargeApproval,
);

router.delete(
  "/:construction_ets_recharge_approval_id",
  validateRequest(getConstructionEtsRechargeApprovalByIdValidation, REQUEST_SOURCE.PARAMS),
  deleteConstructionEtsRechargeApproval,
);

export default router;
