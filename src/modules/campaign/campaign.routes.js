import express from "express";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import {
  getCampaigns,
  getCampaignStats,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getFilteredContacts,
  saveContactSelection,
  sendTestEmail,
  sendCampaign,
} from "./campaign.controller.js";
import {
  createCampaignSchema,
  updateCampaignSchema,
  campaignIdParamSchema,
  getCampaignsSchema,
  getContactsSchema,
  saveContactSelectionSchema,
  sendTestEmailSchema,
} from "./campaign.validation.js";
import { createDocumentUpload, handleMulterError } from "../../utils/s3Upload.js";

const router = express.Router();
const upload = createDocumentUpload("campaign");

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

const processFormDataCase = (req, res, next) => {
  if (req.is("multipart/form-data")) {
    return camelToSnakeMiddleware(req, res, next);
  }
  next();
};

/* Campaign CRUD */
router.get("/stats", getCampaignStats);
router.get("/contacts", validateRequest(getContactsSchema, REQUEST_SOURCE.QUERY), getFilteredContacts);
router.get("/", validateRequest(getCampaignsSchema, REQUEST_SOURCE.QUERY), getCampaigns);
router.get("/:campaign_id", validateRequest(campaignIdParamSchema, REQUEST_SOURCE.PARAMS), getCampaignById);
router.post(
  "/",
  upload.single("attachment"),
  handleMulterError,
  processFormDataCase,
  validateRequest(createCampaignSchema, REQUEST_SOURCE.BODY),
  createCampaign
);
router.put(
  "/:campaign_id",
  validateRequest(campaignIdParamSchema, REQUEST_SOURCE.PARAMS),
  upload.single("attachment"),
  handleMulterError,
  processFormDataCase,
  validateRequest(updateCampaignSchema, REQUEST_SOURCE.BODY),
  updateCampaign
);
router.delete("/:campaign_id", validateRequest(campaignIdParamSchema, REQUEST_SOURCE.PARAMS), deleteCampaign);

/* Campaign contact selection (step 2) */
router.put(
  "/:campaign_id/contacts",
  validateRequest(campaignIdParamSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(saveContactSelectionSchema, REQUEST_SOURCE.BODY),
  saveContactSelection
);

/* Send */
router.post("/:campaign_id/send-test", validateRequest(campaignIdParamSchema, REQUEST_SOURCE.PARAMS), validateRequest(sendTestEmailSchema, REQUEST_SOURCE.BODY), sendTestEmail);
router.post("/:campaign_id/send", validateRequest(campaignIdParamSchema, REQUEST_SOURCE.PARAMS), sendCampaign);

export default router;
