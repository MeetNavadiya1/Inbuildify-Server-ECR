import express from "express";
import {
  getAllStructureEngineer,
  getStructureEngineerById,
  createStructureEngineer,
  updateStructureEngineer,
  deleteStructureEngineer,
} from "./structure-engineer.controller.js";
import {
  createStructureEngineerSchema,
  updateStructureEngineerSchema,
  getStructureEngineerByIdSchema,
  getAllStructureEngineerSchema,
  deleteStructureEngineerSchema,
} from "./structure-engineer.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.get(
  "/",
  validateRequest(getAllStructureEngineerSchema, REQUEST_SOURCE.QUERY),
  getAllStructureEngineer,
);

router.get(
  "/:structure_engineer_id",
  validateRequest(getStructureEngineerByIdSchema, REQUEST_SOURCE.PARAMS),
  getStructureEngineerById,
);

router.post(
  "/",
  validateRequest(createStructureEngineerSchema, REQUEST_SOURCE.BODY),
  createStructureEngineer,
);

router.put(
  "/:structure_engineer_id",
  validateRequest(updateStructureEngineerSchema, REQUEST_SOURCE.BODY),
  updateStructureEngineer,
);

router.delete(
  "/:structure_engineer_id",
  validateRequest(deleteStructureEngineerSchema, REQUEST_SOURCE.PARAMS),
  deleteStructureEngineer,
);

export default router;
