import express from "express";

const router = express.Router();

import { createAgentReferralPartner, getAgentReferralPartnerById, getAgentReferralPartners, updateAgentReferralPartner, deleteAgentReferralPartner } from "./agent-referral-partner.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import {
  createAgentReferralPartnerSchema,
  updateAgentReferralPartnerSchema,
  getAgentReferralPartnerSchema,
  paramsIdSchema,
} from "./agent-referral-partner.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.post(
  "/",
  validateRequest(createAgentReferralPartnerSchema, REQUEST_SOURCE.BODY),
  createAgentReferralPartner,
);

router.get(
  "/",
  validateRequest(getAgentReferralPartnerSchema, REQUEST_SOURCE.QUERY),
  getAgentReferralPartners,
);

router.get(
  "/:partner_id",
  getAgentReferralPartnerById,
);

router.put(
  "/:partner_id",
  validateRequest(paramsIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateAgentReferralPartnerSchema, REQUEST_SOURCE.BODY),
  updateAgentReferralPartner,
);

router.delete(
  "/:partner_id",
  validateRequest(paramsIdSchema, REQUEST_SOURCE.PARAMS),
  deleteAgentReferralPartner,
);

export default router;
