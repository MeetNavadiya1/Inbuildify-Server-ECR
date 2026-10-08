import express from "express";
const router = express.Router();

import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { 
  sendQuotationEsignSchema, 
  sendQuotationEsignBodySchema,
  getSigningUrlSchema,
  cancelEsignSchema
} from "./docusign.validation.js";
import docusignController from "./docusign.controller.js";

// Public routes — no auth required
router.get("/public/sign", docusignController.publicSigningRedirect);
router.get("/public/signing-callback", docusignController.signingCallback);
router.get("/public/status/:envelope_id", docusignController.publicStatusSync);
router.get("/public/download/:envelope_id", docusignController.publicDownloadSignedDocument);
// express.json() is already applied globally in server.js (with rawBody capture); no need to re-apply here.
router.post("/webhook", docusignController.handleWebhook);

// Authenticated Routes
router.use(authMiddleware);
router.use(roleMiddleware);

router.post(
  "/quotation/:quotationVersionId/send",
  validateRequest(sendQuotationEsignSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(sendQuotationEsignBodySchema, REQUEST_SOURCE.BODY),
  camelToSnakeMiddleware,
  docusignController.sendQuotationForEsign
);

router.post(
  "/envelope/:envelopeId/cancel",
  validateRequest(cancelEsignSchema, REQUEST_SOURCE.BODY),
  camelToSnakeMiddleware,
  docusignController.cancelEsignRequest
);

// Send a job variation for e-signature (returns an embedded signing URL).
router.post(
  "/variation/:variationId/send",
  camelToSnakeMiddleware,
  docusignController.sendVariationForEsign,
);

router.get("/envelope/:envelopeId/status", camelToSnakeMiddleware, docusignController.getEnvelopeStatus);
router.get("/envelope/:envelopeId/download", camelToSnakeMiddleware, docusignController.downloadSignedDocument);
router.get("/quotation/:quotationVersionId/status", camelToSnakeMiddleware, docusignController.getQuotationEsignStatus);
router.post("/quotation/:quotationVersionId/resend", camelToSnakeMiddleware, docusignController.resendEsignRequest);
router.get("/history", camelToSnakeMiddleware, docusignController.getEsignHistory);

router.get(
  "/envelope/:envelopeId/signing-url",
  validateRequest(getSigningUrlSchema, REQUEST_SOURCE.QUERY),
  camelToSnakeMiddleware,
  docusignController.getSigningUrl
);


export default router;