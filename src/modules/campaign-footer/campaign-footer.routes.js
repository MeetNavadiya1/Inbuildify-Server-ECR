import express from "express";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import {
  createCampaignFooter,
  getCampaignFooters,
  getCampaignFooterById,
  updateCampaignFooter,
  deleteCampaignFooter,
} from "./campaign-footer.controller.js";
import {
  createCampaignFooterSchema,
  updateCampaignFooterSchema,
  footerIdParamSchema,
} from "./campaign-footer.validation.js";

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.get("/", getCampaignFooters);
router.get("/:footer_id", validateRequest(footerIdParamSchema, REQUEST_SOURCE.PARAMS), getCampaignFooterById);
router.post("/", validateRequest(createCampaignFooterSchema, REQUEST_SOURCE.BODY), createCampaignFooter);
router.put("/:footer_id", validateRequest(footerIdParamSchema, REQUEST_SOURCE.PARAMS), validateRequest(updateCampaignFooterSchema, REQUEST_SOURCE.BODY), updateCampaignFooter);
router.delete("/:footer_id", validateRequest(footerIdParamSchema, REQUEST_SOURCE.PARAMS), deleteCampaignFooter);

export default router;
