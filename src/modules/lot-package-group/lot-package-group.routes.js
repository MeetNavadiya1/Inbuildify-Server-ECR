import express from "express";

const router = express.Router();

import {
  createLotPackageGroupSchema,
  updateLotPackageGroupSchema,
  getLotPackageGroupByIdSchema,
  deleteLotPackageGroupSchema,
  getAllLotPackageGroupsSchema,
} from "./lot-package-group.validation.js";
import {
  createLotPackageGroup,
  updateLotPackageGroup,
  getLotPackageGroupById,
  deleteLotPackageGroup,
  getAllLotPackageGroups,
} from "./lot-package-group.controller.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.get("/", validateRequest(getAllLotPackageGroupsSchema, REQUEST_SOURCE.QUERY), getAllLotPackageGroups);
router.get("/:lot_package_group_id", validateRequest(getLotPackageGroupByIdSchema, REQUEST_SOURCE.PARAMS), getLotPackageGroupById);
router.post("/", validateRequest(createLotPackageGroupSchema, REQUEST_SOURCE.BODY), createLotPackageGroup);
router.put("/:lot_package_group_id", validateRequest(getLotPackageGroupByIdSchema, REQUEST_SOURCE.PARAMS), validateRequest(updateLotPackageGroupSchema, REQUEST_SOURCE.BODY), updateLotPackageGroup);
router.delete("/:lot_package_group_id", validateRequest(deleteLotPackageGroupSchema, REQUEST_SOURCE.PARAMS), deleteLotPackageGroup);

export default router;
