import express from "express";

const router = express.Router();
import { getAllRanges, createRange, updateRange, deleteRange, updateRangeActive } from "./range.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  createRangeSchema,
  updateRangeSchema,
  updateRangeParamsSchema,
  deleteRangeSchema,
  updateRangeActiveSchema,
} from "./range.validation.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { createUpload, handleMulterError } from "../../utils/s3Upload.js";

router.use(authMiddleware);
router.use(roleMiddleware);
const upload = createUpload("range");

router.get("/", camelToSnakeMiddleware, getAllRanges);
router.post(
  "/",
  upload.fields([
    { name: "logoUrl", maxCount: 1 },
    { name: "headerUrl", maxCount: 1 },
  ]),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(createRangeSchema, REQUEST_SOURCE.FORM_DATA),
  createRange,
);
router.put(
  "/:range_id",
  upload.fields([
    { name: "logoUrl", maxCount: 1 },
    { name: "headerUrl", maxCount: 1 },
  ]),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(updateRangeParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateRangeSchema, REQUEST_SOURCE.FORM_DATA),
  updateRange,
);
router.delete(
  "/:range_id",
  camelToSnakeMiddleware,
  validateRequest(deleteRangeSchema.params, REQUEST_SOURCE.PARAMS),
  deleteRange,
);

router.put(
  "/is-active/:range_id",
  camelToSnakeMiddleware,
  validateRequest(updateRangeParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateRangeActiveSchema, REQUEST_SOURCE.BODY),
  updateRangeActive,
);

export default router;
