import express from "express";

const router = express.Router();

import {
  createContractFormat,
  getAllContractFormats,
  getContractFormatById,
  updateContractFormat,
  deleteContractFormat,
} from "./contract-format.controller.js";
import {
  createContractFormatSchema,
  getAllContractFormatsSchema,
  getContractFormatByIdSchema,
  updateContractFormatParamsSchema,
  updateContractFormatSchema,
  deleteContractFormatSchema,
} from "./contract-format.validation.js";
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
  validateRequest(createContractFormatSchema, REQUEST_SOURCE.BODY),
  createContractFormat,
);

router.get(
  "/",
  validateRequest(getAllContractFormatsSchema, REQUEST_SOURCE.QUERY),
  getAllContractFormats,
);

router.get(
  "/:contract_format_id",
  validateRequest(getContractFormatByIdSchema, REQUEST_SOURCE.PARAMS),
  getContractFormatById,
);

router.put(
  "/:contract_format_id",
  validateRequest(updateContractFormatParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateContractFormatSchema, REQUEST_SOURCE.BODY),
  updateContractFormat,
);

router.delete(
  "/:contract_format_id",
  validateRequest(deleteContractFormatSchema, REQUEST_SOURCE.PARAMS),
  deleteContractFormat,
);

export default router;
