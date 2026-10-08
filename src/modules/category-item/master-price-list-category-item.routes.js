import express from "express";

const router = express.Router();

import {
  createMasterPriceListCategoryItem,
  updateMasterPriceListCategoryItem,
  getMasterPriceListCategoryItemsByCategoryId,
  deleteMasterPriceListCategoryItem,
} from "./master-price-list-category-item.controller.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  createMasterPriceListCategoryItemSchema,
  getMasterPriceListCategoryItemsByCategoryIdSchema,
  updateMasterPriceListCategoryItemSchema,
  deleteMasterPriceListCategoryItemSchema,
} from "./master-price-list-category-item.validation.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.post(
  "/",
  validateRequest(createMasterPriceListCategoryItemSchema),
  createMasterPriceListCategoryItem,
);
router.get(
  "/:categoryId",
  validateRequest(
    getMasterPriceListCategoryItemsByCategoryIdSchema,
    REQUEST_SOURCE.QUERY,
  ),
  getMasterPriceListCategoryItemsByCategoryId,
);
router.put(
  "/:category_item_id",
  validateRequest(updateMasterPriceListCategoryItemSchema),
  updateMasterPriceListCategoryItem,
);
router.delete(
  "/:category_item_id",
  validateRequest(
    deleteMasterPriceListCategoryItemSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  deleteMasterPriceListCategoryItem,
);

export default router;
