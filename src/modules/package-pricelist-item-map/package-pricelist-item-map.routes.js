import express from "express";

const router = express.Router();

import {
  createPackagePriceListItemMap,
  getAllPackagePriceListItemMap,
  getPackagePricelistItemByPackageId,
  deletePackagePricelistItemMapMap,
  updatePackagePriceListItemMap,
} from "./package_pricelist_item_map.controller.js";
import {
  createPriceListItemMapSchema,
  getAllPackagePriceListItemMapSchema,
  getPackagePricelistItemByPackageIdSchema,
  deletePackagePricelistItemMapMapSchema,
  updateackagePricelistItemMapParamsSchema,
  updatePriceListItemMapSchema,
} from "./package-pricelist-item-map.validation.js";
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
  validateRequest(createPriceListItemMapSchema, REQUEST_SOURCE.BODY),
  createPackagePriceListItemMap,
);

router.get(
  "/",
  validateRequest(getAllPackagePriceListItemMapSchema, REQUEST_SOURCE.QUERY),
  getAllPackagePriceListItemMap,
);

router.get(
  "/:package_id",
  validateRequest(
    getPackagePricelistItemByPackageIdSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  getPackagePricelistItemByPackageId,
);

router.delete(
  "/:id",
  validateRequest(
    deletePackagePricelistItemMapMapSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  deletePackagePricelistItemMapMap,
);

router.put(
  "/:id",
  validateRequest(
    updateackagePricelistItemMapParamsSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  validateRequest(updatePriceListItemMapSchema, REQUEST_SOURCE.BODY),
  updatePackagePriceListItemMap,
);

export default router;
