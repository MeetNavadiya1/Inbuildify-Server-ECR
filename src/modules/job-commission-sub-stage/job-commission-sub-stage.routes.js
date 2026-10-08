import express from "express";

const router = express.Router();

import {
  createJobCommissionSubStage,
  getAllJobCommissionSubStages,
  getJobCommissionSubStagesByCommissionId,
  deleteJobCommissionSubStage,
  updateJobCommissionSubStage,
} from "./job-commission-sub-stage.controller.js";
import {
  createJobCommissionSubStageSchema,
  getAllJobCommissionSubStageSchema,
  getJobCommissionSubStagesByCommissionIdSchema,
  getJobCommissionSubStagesByCommissionSchema,
  deleteJobCommissionSubStageSchema,
  updateJobCommissionSubStageParamsSchema,
  updateJobCommissionSubStageSchema,
} from "./job-commission-sub-stage.validation.js";
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
  validateRequest(createJobCommissionSubStageSchema, REQUEST_SOURCE.BODY),
  createJobCommissionSubStage,
);

router.get(
  "/",
  validateRequest(getAllJobCommissionSubStageSchema, REQUEST_SOURCE.QUERY),
  getAllJobCommissionSubStages,
);

router.get(
  "/:job_commission_id",
  validateRequest(
    getJobCommissionSubStagesByCommissionIdSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  validateRequest(
    getJobCommissionSubStagesByCommissionSchema,
    REQUEST_SOURCE.QUERY,
  ),
  getJobCommissionSubStagesByCommissionId,
);

router.delete(
  "/:id",
  validateRequest(deleteJobCommissionSubStageSchema, REQUEST_SOURCE.PARAMS),
  deleteJobCommissionSubStage,
);

router.put(
  "/:job_commission_sub_stage_id",
  validateRequest(
    updateJobCommissionSubStageParamsSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  validateRequest(updateJobCommissionSubStageSchema, REQUEST_SOURCE.BODY),
  updateJobCommissionSubStage,
);
export default router;
