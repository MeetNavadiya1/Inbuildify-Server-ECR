import express from "express";

const router = express.Router();

import {
  getAllColorSubCategories,
  getColorSubCategoryById,
  createColorSubCategory,
  updateColorSubCategory,
  deleteColorSubCategory,
} from "./color-sub-category.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  getAllColorSubCategoriesSchema,
  getAllColorSubCategoriesParamsSchema,
  createColorSubCategorySchema,
  updateColorSubCategorySchema,
  colorSubCategoryIdParamSchema,
} from "./color-sub-category.validation.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);

router.get("/:color_category_id", validateRequest(getAllColorSubCategoriesParamsSchema, REQUEST_SOURCE.PARAMS), validateRequest(getAllColorSubCategoriesSchema, REQUEST_SOURCE.QUERY), getAllColorSubCategories);
router.get("/sub_category/:color_sub_category_id", validateRequest(colorSubCategoryIdParamSchema, REQUEST_SOURCE.PARAMS), getColorSubCategoryById);
router.post("/", validateRequest(createColorSubCategorySchema, REQUEST_SOURCE.BODY), createColorSubCategory);
router.put("/:color_sub_category_id", validateRequest(updateColorSubCategorySchema, REQUEST_SOURCE.BODY), updateColorSubCategory);
router.delete("/:color_sub_category_id", validateRequest(colorSubCategoryIdParamSchema, REQUEST_SOURCE.PARAMS), deleteColorSubCategory);

export default router;
