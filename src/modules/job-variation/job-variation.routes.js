import express from "express";
import {
  createJobVariation,
  getJobVariations,
  getJobVariationById,
  updateJobVariation,
  deleteJobVariation,
  getVariationEmailData,
  sendVariationEmail,
  previewJobVariation,
  uploadSignedVariationDocument,
  getSignedVariationDocument,
  deleteSignedVariationDocument,
  getInvoiceEmailData,
  sendInvoiceEmail,
} from "./job-variation.controller.js";
import { createImageOrPdfUpload, handleMulterError } from "../../utils/s3Upload.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  createJobVariationSchema,
  updateJobVariationSchema,
  jobVariationParamsSchema,
  variationIdParamsSchema,
  sendVariationEmailSchema,
  sendInvoiceEmailSchema,
} from "./job-variation.validation.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware);

// POST /job-variation/:job_id — create a variation for a job
router.post(
  "/:job_id",
  camelToSnakeMiddleware,
  validateRequest(createJobVariationSchema.params, REQUEST_SOURCE.PARAMS),
  validateRequest(createJobVariationSchema.body, REQUEST_SOURCE.BODY),
  createJobVariation,
);

// POST /job-variation/:job_id/preview — render a preview PDF of current items
router.post(
  "/:job_id/preview",
  camelToSnakeMiddleware,
  validateRequest(jobVariationParamsSchema, REQUEST_SOURCE.PARAMS),
  previewJobVariation,
);

// Signed variation document (tracker step 4). Declared before the generic
// /:variation_id routes so the two-segment paths resolve correctly.
// POST — upload the signed document (multipart "file").
router.post(
  "/:variation_id/signed-document",
  validateRequest(variationIdParamsSchema, REQUEST_SOURCE.PARAMS),
  createImageOrPdfUpload("job-variation").single("file"),
  handleMulterError,
  uploadSignedVariationDocument,
);

// GET — presigned download URL for the signed document.
router.get(
  "/:variation_id/signed-document",
  validateRequest(variationIdParamsSchema, REQUEST_SOURCE.PARAMS),
  getSignedVariationDocument,
);

// DELETE — remove the signed document and reopen step 4.
router.delete(
  "/:variation_id/signed-document",
  validateRequest(variationIdParamsSchema, REQUEST_SOURCE.PARAMS),
  deleteSignedVariationDocument,
);

// GET /job-variation/job/:job_id — list all variations for a job
router.get(
  "/job/:job_id",
  validateRequest(jobVariationParamsSchema, REQUEST_SOURCE.PARAMS),
  getJobVariations,
);

// GET /job-variation/:variation_id/email — prefill data for the approval email
router.get(
  "/:variation_id/email",
  validateRequest(variationIdParamsSchema, REQUEST_SOURCE.PARAMS),
  getVariationEmailData,
);

// POST /job-variation/:variation_id/email — send the approval email to the builder
router.post(
  "/:variation_id/email",
  camelToSnakeMiddleware,
  validateRequest(sendVariationEmailSchema.params, REQUEST_SOURCE.PARAMS),
  validateRequest(sendVariationEmailSchema.body, REQUEST_SOURCE.BODY),
  sendVariationEmail,
);

// Invoice for the variation amount (tracker step 6). Declared before the
// generic /:variation_id routes, like the signed-document paths above.
// GET — prefill data (customer recipient, invoice subject/message).
router.get(
  "/:variation_id/invoice-email",
  validateRequest(variationIdParamsSchema, REQUEST_SOURCE.PARAMS),
  getInvoiceEmailData,
);

// POST — generate + store the invoice PDF and email it to the customer.
router.post(
  "/:variation_id/invoice-email",
  camelToSnakeMiddleware,
  validateRequest(sendInvoiceEmailSchema.params, REQUEST_SOURCE.PARAMS),
  validateRequest(sendInvoiceEmailSchema.body, REQUEST_SOURCE.BODY),
  sendInvoiceEmail,
);

// GET /job-variation/:variation_id — fetch a single variation
router.get(
  "/:variation_id",
  validateRequest(variationIdParamsSchema, REQUEST_SOURCE.PARAMS),
  getJobVariationById,
);

// PUT /job-variation/:variation_id — update a variation
router.put(
  "/:variation_id",
  camelToSnakeMiddleware,
  validateRequest(updateJobVariationSchema.params, REQUEST_SOURCE.PARAMS),
  validateRequest(updateJobVariationSchema.body, REQUEST_SOURCE.BODY),
  updateJobVariation,
);

// DELETE /job-variation/:variation_id — delete a variation
router.delete(
  "/:variation_id",
  validateRequest(variationIdParamsSchema, REQUEST_SOURCE.PARAMS),
  deleteJobVariation,
);

export default router;
