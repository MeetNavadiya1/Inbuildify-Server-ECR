import express from "express";

const router = express.Router();

import {
  createColorItem,
  getAllColorItems,
  getColorItemById,
  updateColorItem,
  deleteColorItem,
  deleteImageField,
  colorItemMove,
  copyColorItem,
  getColorItemsWithoutCategory,
  generateColorPdf,
  generateColorEmail,
} from "./color-item.controller.js";
import {
  createColorItemSchema,
  getAllColorItemsSchema,
  getColorItemsWithoutCategorySchema,
  getColorItemByIdSchema,
  updateColorItemSchema,
  deleteColorItemSchema,
  deleteImageFieldSchema,
  colorItemMoveSchema,
  copyColorItemSchema,
  sendColorEmailSchema,
} from "./color-item.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { createUpload, createImageOrPdfUpload, handleMulterError } from "../../utils/s3Upload.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

const upload = createUpload("color-item");
const uploadImgOrPdf = createImageOrPdfUpload("color-item");

// Must be before any /:param routes so "pdf" is not consumed as a param value
router.post("/pdf", generateColorPdf);

router.post(
  "/email",
  validateRequest(sendColorEmailSchema, REQUEST_SOURCE.BODY),
  generateColorEmail,
);

router.post(
  "/",
  uploadImgOrPdf.fields([
    { name: "specification", maxCount: 10 },
    { name: "colorImage", maxCount: 10 },
  ]),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(createColorItemSchema, REQUEST_SOURCE.FORM_DATA),
  createColorItem,
);

router.get(
  "/",
  validateRequest(getAllColorItemsSchema, REQUEST_SOURCE.QUERY),
  getAllColorItems,
);

// Get color items without category
router.get(
  "/without-category",
  authMiddleware,
  roleMiddleware,
  validateRequest(getColorItemsWithoutCategorySchema, REQUEST_SOURCE.QUERY),
  getColorItemsWithoutCategory,
);

router.get(
  "/:color_item_id",
  camelToSnakeMiddleware,
  validateRequest(getColorItemByIdSchema, REQUEST_SOURCE.PARAMS),
  getColorItemById,
);

router.put(
  "/:color_item_id",
  upload.fields([
    { name: "specification", maxCount: 10 },
    { name: "colorImage", maxCount: 10 },
  ]),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(getColorItemByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateColorItemSchema, REQUEST_SOURCE.FORM_DATA),
  updateColorItem,
);

router.delete(
  "/:color_item_id",
  validateRequest(deleteColorItemSchema, REQUEST_SOURCE.PARAMS),
  deleteColorItem,
);

router.delete(
  "/image/:color_item_id",
  validateRequest(getColorItemByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(deleteImageFieldSchema, REQUEST_SOURCE.BODY),
  deleteImageField,
);

router.post(
  "/move/:color_item_id",
  validateRequest(getColorItemByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(colorItemMoveSchema, REQUEST_SOURCE.BODY),
  colorItemMove,
);

router.post(
  "/copy/:color_item_id",
  validateRequest(getColorItemByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(copyColorItemSchema, REQUEST_SOURCE.BODY),
  copyColorItem,
);

export default router;
