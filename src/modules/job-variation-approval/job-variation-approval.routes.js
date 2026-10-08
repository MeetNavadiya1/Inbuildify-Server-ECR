import express from "express";

const router = express.Router();

import {
  createJobVariationApproval,
  getJobVariationApprovals,
  deleteJobVariationApproval,
  updateJobVariationApproval,
} from "./job-variation-approval.controller.js";
import {
  createJobVariationApprovalSchema,
  getJobVariationApprovalsSchema,
  deleteJobVariationApprovalSchema,
  updateJobVariationApprovalSchema,
  updateJobVariationApprovalParamsSchema,
} from "./job-variation-approval.validation.js";
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
  validateRequest(createJobVariationApprovalSchema, REQUEST_SOURCE.BODY),
  createJobVariationApproval,
);

router.get(
  "/",
  validateRequest(getJobVariationApprovalsSchema, REQUEST_SOURCE.QUERY),
  getJobVariationApprovals,
);

router.put(
  "/:id",
  validateRequest(
    updateJobVariationApprovalParamsSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  validateRequest(updateJobVariationApprovalSchema, REQUEST_SOURCE.BODY),
  updateJobVariationApproval,
);

router.delete(
  "/:id",
  validateRequest(deleteJobVariationApprovalSchema, REQUEST_SOURCE.PARAMS),
  deleteJobVariationApproval,
);

export default router;
