import express from "express";

const router = express.Router();

import { createColorGroupItemMap, getAllColorGroupItemMaps, deleteColorGroupItemMap } from "./color-group-item-map.controller.js";
import {
  createColorGroupItemMapSchema,
  getAllColorGroupItemMapsSchema,
  deleteColorGroupItemMapSchema,
} from "./color-group-item-map.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import caseConverterMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(caseConverterMiddleware);

router.post(
  "/",
  validateRequest(createColorGroupItemMapSchema, REQUEST_SOURCE.BODY),
  createColorGroupItemMap,
);

router.get(
  "/",
  validateRequest(getAllColorGroupItemMapsSchema, REQUEST_SOURCE.QUERY),
  getAllColorGroupItemMaps,
);

router.delete(
  "/:id",
  validateRequest(deleteColorGroupItemMapSchema, REQUEST_SOURCE.PARAMS),
  deleteColorGroupItemMap,
);

export default router;
