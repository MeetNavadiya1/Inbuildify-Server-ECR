import express from "express";

const router = express.Router();

import {
  createPriceListItem,
  getAllPriceListItems,
  deletePriceListItem,
  updatePriceListItem,
  copyPriceListItem,
} from "./price-list-item.controller.js";
import {
  createPriceListItemSchema,
  getAllPriceListItemSchema,
  deletePriceListItemSchema,
  updatePriceListItemSParamschema,
  updatePriceListItemSchema,
  copyPriceListItemParamSchema,
  copyPriceListItemBodySchema,
} from "./price-list-item.validation.js";
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
  validateRequest(createPriceListItemSchema, REQUEST_SOURCE.BODY),
  createPriceListItem,
);

router.get(
  "/",
  validateRequest(getAllPriceListItemSchema, REQUEST_SOURCE.QUERY),
  getAllPriceListItems,
);

router.delete(
  "/:priceListItemId",
  validateRequest(deletePriceListItemSchema, REQUEST_SOURCE.PARAMS),
  deletePriceListItem,
);

router.put(
  "/:price_list_item_id",
  validateRequest(updatePriceListItemSParamschema, REQUEST_SOURCE.PARAMS),
  validateRequest(updatePriceListItemSchema, REQUEST_SOURCE.BODY),
  updatePriceListItem,
);

router.post(
  "/copy/:price_list_item_id",
  validateRequest(copyPriceListItemParamSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(copyPriceListItemBodySchema, REQUEST_SOURCE.BODY),
  copyPriceListItem,
);

export default router;
