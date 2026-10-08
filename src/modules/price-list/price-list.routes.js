import express from "express";

const router = express.Router();

import {
  createPriceList,
  getAllPriceList,
  deletePriceList,
  updatePriceList,
  toggleSuggestedPriceList,
} from "./price-list.controller.js";
import {
  createPriceListSchema,
  getAllPriceListSchema,
  deletePriceListSchema,
  updatePriceListParamsSchema,
  updatePriceListSchema,
} from "./price-list.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);
router.use(scopeBuilder);

router.post(
  "/",
  requirePermission(MODULES.PRICE_LIST, ACTIONS.CREATE),
  validateRequest(createPriceListSchema, REQUEST_SOURCE.BODY),
  createPriceList,
);

router.get(
  "/",
  requirePermission(MODULES.PRICE_LIST, ACTIONS.READ),
  validateRequest(getAllPriceListSchema, REQUEST_SOURCE.QUERY),
  getAllPriceList,
);

router.delete(
  "/:priceListId",
  requirePermission(MODULES.PRICE_LIST, ACTIONS.DELETE),
  validateRequest(deletePriceListSchema, REQUEST_SOURCE.PARAMS),
  deletePriceList,
);

router.put(
  "/:priceListId",
  requirePermission(MODULES.PRICE_LIST, ACTIONS.UPDATE),
  validateRequest(updatePriceListParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updatePriceListSchema, REQUEST_SOURCE.BODY),
  updatePriceList,
);

router.put(
  "/suggested/:priceListId",
  requirePermission(MODULES.PRICE_LIST, ACTIONS.UPDATE),
  validateRequest(deletePriceListSchema, REQUEST_SOURCE.PARAMS),
  toggleSuggestedPriceList,
);

export default router;
