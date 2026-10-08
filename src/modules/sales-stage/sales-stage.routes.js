import express from "express";

const router = express.Router();

import {
  createSalesStage,
  getAllSalesStages,
  getSalesStagesBySalesProcessId,
  deleteSalesStage,
  updateSalesStage,
  updateSalesStageIsActive,
} from "./sales-stage.controller.js";
import {
  createSalesStageSchema,
  getSalesStageBySalesProcessIdSchema,
  deleteSalesStageSchema,
  updateSalesStageIdParamsSchema,
  updateSalesStageSchema,
  updateSalesStageIsActiveSchema,
} from "./sales-stage.validation.js";
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
  validateRequest(createSalesStageSchema, REQUEST_SOURCE.BODY),
  createSalesStage,
);

router.get("/", getAllSalesStages);

router.get(
  "/process",
  validateRequest(getSalesStageBySalesProcessIdSchema, REQUEST_SOURCE.QUERY),
  getSalesStagesBySalesProcessId,
);
router.delete(
  "/:sales_stage_id",
  validateRequest(deleteSalesStageSchema, REQUEST_SOURCE.PARAMS),
  deleteSalesStage,
);

router.put(
  "/:sales_stage_id",
  validateRequest(updateSalesStageIdParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateSalesStageSchema, REQUEST_SOURCE.BODY),
  updateSalesStage,
);

router.put(
  "/is-active/:sales_stage_id",
  validateRequest(updateSalesStageIdParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateSalesStageIsActiveSchema, REQUEST_SOURCE.BODY),
  updateSalesStageIsActive,
);
export default router;
