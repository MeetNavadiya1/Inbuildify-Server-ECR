import express from "express";

const router = express.Router();

import {
  createPriceListItemCondition,
  getAllPriceListItemConditions,
  getPriceListItemConditionById,
  updatePriceListItemCondition,
  deletePriceListItemCondition,
} from "./price-list-item-condition.controller.js";
import {
  createPriceListItemConditionValidation,
  updatePriceListItemConditionValidation,
  getPriceListItemConditionByIdValidation,
  deletePriceListItemConditionValidation,
  getAllPriceListItemConditionsValidation,
} from "./price-list-item-condition.validation.js";
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
  validateRequest(createPriceListItemConditionValidation, REQUEST_SOURCE.BODY),
  createPriceListItemCondition,
);

router.get(
  "/",
  validateRequest(
    getAllPriceListItemConditionsValidation,
    REQUEST_SOURCE.QUERY,
  ),
  getAllPriceListItemConditions,
);

router.get(
  "/:price_list_item_condition_id",
  validateRequest(
    getPriceListItemConditionByIdValidation,
    REQUEST_SOURCE.PARAMS,
  ),
  getPriceListItemConditionById,
);

router.put(
  "/:price_list_item_condition_id",
  validateRequest(
    getPriceListItemConditionByIdValidation,
    REQUEST_SOURCE.PARAMS,
  ),
  validateRequest(updatePriceListItemConditionValidation, REQUEST_SOURCE.BODY),
  updatePriceListItemCondition,
);

router.delete(
  "/:price_list_item_condition_id",
  validateRequest(
    deletePriceListItemConditionValidation,
    REQUEST_SOURCE.PARAMS,
  ),
  deletePriceListItemCondition,
);

export default router;
