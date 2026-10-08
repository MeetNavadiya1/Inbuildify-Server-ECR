import express from "express";

const router = express.Router();

import {
  getAllMasterPriceListCategories,
  getMasterPriceListCategoryById,
  createMasterPriceListCategory,
  updateMasterPriceListCategory,
  displayOrderManage,
  deleteMasterPriceListCategory,
} from "./master-price-list-category.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  getAllMasterPriceListCategoriesSchema,
  createMasterPriceListCategorySchema,
  updateMasterPriceListCategorySchema,
  displayOrderManageSchema,
  deleteMasterPriceListCategorySchema,
  getMasterPriceListCategoryByIdSchema,
} from "./master-price-list-category.validation.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.get(
  "/",
  validateRequest(getAllMasterPriceListCategoriesSchema, REQUEST_SOURCE.QUERY),
  getAllMasterPriceListCategories,
);
router.get(
  "/:id",
  validateRequest(getMasterPriceListCategoryByIdSchema, REQUEST_SOURCE.PARAMS),
  getMasterPriceListCategoryById,
);
router.post(
  "/",
  validateRequest(createMasterPriceListCategorySchema, REQUEST_SOURCE.BODY),
  createMasterPriceListCategory,
);
router.put(
  "/:id",
  validateRequest(updateMasterPriceListCategorySchema, REQUEST_SOURCE.BODY),
  updateMasterPriceListCategory,
);
router.put(
  "/order/display-order",
  validateRequest(displayOrderManageSchema, REQUEST_SOURCE.BODY),
  displayOrderManage,
);
router.delete(
  "/:id",
  validateRequest(deleteMasterPriceListCategorySchema, REQUEST_SOURCE.PARAMS),
  deleteMasterPriceListCategory,
);

export default router;
