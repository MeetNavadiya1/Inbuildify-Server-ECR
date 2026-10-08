import express from "express";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import quotationVersionItemController from "./quotation-version-item.controller.js";
import {
  addQuotationItemSchema,
  addQuotationPackageSchema,
  updateQuotationPackageSchema,
  updateQuotationItemSchema,
  getItemsByVersionParamsSchema,
  getItemsByVersionQuerySchema,
  idParamsSchema,
  deletePackageParamsSchema,
  addExtraQuotationItemSchema,
  updateExtraQuotationItemSchema,
} from "./quotation-version-item.validation.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(scopeBuilder);

// Add single item snapshot
router.post(
  "/item",
  requirePermission(MODULES.QUOTATION, ACTIONS.CREATE),
  camelToSnakeMiddleware,
  validateRequest(addQuotationItemSchema, REQUEST_SOURCE.BODY),
  quotationVersionItemController.addQuotationItem,
);

// Add extra item snapshot
router.post(
  "/extra-item/:quotation_version_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.CREATE),
  camelToSnakeMiddleware,
  validateRequest(getItemsByVersionParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(addExtraQuotationItemSchema, REQUEST_SOURCE.BODY),
  quotationVersionItemController.addExtraQuotationItem,
);

// Update extra item snapshot
router.put(
  "/extra-item/:id",
  requirePermission(MODULES.QUOTATION, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  validateRequest(idParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateExtraQuotationItemSchema, REQUEST_SOURCE.BODY),
  quotationVersionItemController.updateExtraQuotationItem,
);

// Add package items snapshot
router.post(
  "/package",
  requirePermission(MODULES.QUOTATION, ACTIONS.CREATE),
  camelToSnakeMiddleware,
  validateRequest(addQuotationPackageSchema, REQUEST_SOURCE.BODY),
  quotationVersionItemController.addQuotationPackage,
);

// Update package items snapshot (Replace)
router.put(
  "/package",
  requirePermission(MODULES.QUOTATION, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  validateRequest(updateQuotationPackageSchema, REQUEST_SOURCE.BODY),
  quotationVersionItemController.updateQuotationPackage,
);

// List all items for a version
router.get(
  "/version/:quotation_version_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.READ),
  validateRequest(getItemsByVersionParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(getItemsByVersionQuerySchema, REQUEST_SOURCE.QUERY),
  quotationVersionItemController.getQuotationVersionItems,
);

// Update item snapshot
router.put(
  "/:id",
  requirePermission(MODULES.QUOTATION, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  validateRequest(idParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateQuotationItemSchema, REQUEST_SOURCE.BODY),
  quotationVersionItemController.updateQuotationVersionItem,
);

// Delete item
router.delete(
  "/item/:id",
  requirePermission(MODULES.QUOTATION, ACTIONS.DELETE),
  validateRequest(idParamsSchema, REQUEST_SOURCE.PARAMS),
  quotationVersionItemController.deleteQuotationVersionItem,
);

// Delete package items from version
router.delete(
  "/package/:quotation_version_id/:package_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.DELETE),
  validateRequest(deletePackageParamsSchema, REQUEST_SOURCE.PARAMS),
  quotationVersionItemController.removePackageFromVersion,
);

export default router;
