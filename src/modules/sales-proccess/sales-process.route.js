import express from "express";

const router = express.Router();

import {
  createSalesProcess,
  getAllSalesProcess,
  deleteSalesProcess,
  updateSalesProcess,
} from "./sales-process.controller.js";
import {
  createSalesProccessSchema,
  deleteSalesProcessSchema,
  updateSalesProcessIdParamsSchema,
  updateSalesProcessSchema,
} from "./sales-process.validation.js";
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
  validateRequest(createSalesProccessSchema, REQUEST_SOURCE.BODY),
  createSalesProcess,
);

router.get("/", getAllSalesProcess);

router.delete(
  "/:id",
  validateRequest(deleteSalesProcessSchema, REQUEST_SOURCE.PARAMS),
  deleteSalesProcess,
);

router.put(
  "/:id",
  validateRequest(updateSalesProcessIdParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateSalesProcessSchema, REQUEST_SOURCE.BODY),
  updateSalesProcess,
);
export default router;
